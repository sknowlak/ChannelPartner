const crypto = require('crypto');
const IntegrationSource = require('../models/IntegrationSource');
const IntegrationLink = require('../models/IntegrationLink');
const InboundEvent = require('../models/InboundEvent');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { PERMISSIONS } = require('../config/permissions');
const { sanitizeAuth, authProblem, maskAuth, verifyHmac } = require('../services/httpAuthService');
const { maskHeaders, headersProblem } = require('../utils/secretHeaders');
const { outboundUrlProblem, urlShapeProblem } = require('../utils/outboundUrl');
const { listPaths } = require('../utils/jsonPath');
const { importPayload, previewPayload } = require('../services/leadImportService');
const { runPull, testPull } = require('../services/pullService');
const { logEvent } = require('../services/auditService');

// Receive & Pull sources (section 51) - leads coming in from another system
// in that system's own format. See models/IntegrationSource.js.

const MAX_MAPPING_ROWS = 200;
const PAGINATION_TYPES = ['NONE', 'PAGE', 'OFFSET', 'CURSOR', 'NEXT_URL'];
const MAX_SAMPLE_CHARS = 50000;

const str = (v, max = 200) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const canManage = (req) => (req.permissions || []).includes(PERMISSIONS.MANAGE_SETTINGS);
const generateSourceKey = () => `src_${crypto.randomBytes(20).toString('hex')}`;

function receiveUrlFor(req, sourceKey) {
  return `${req.protocol}://${req.get('host')}/api/channel-partner/hooks/${sourceKey}`;
}

// The receive URL contains the source's secret key, so only people who can
// manage settings see it; auth secrets are never returned at all.
function toClient(source, req) {
  const obj = source.toObject ? source.toObject() : { ...source };
  obj.auth = maskAuth(obj.auth);
  obj.verifyAuth = maskAuth(obj.verifyAuth);
  if (canManage(req)) {
    if (obj.sourceKey) obj.receiveUrl = receiveUrlFor(req, obj.sourceKey);
  } else {
    delete obj.sourceKey;
    delete obj.verifyToken;
    obj.headers = maskHeaders(obj.headers);
  }
  return obj;
}

async function pullUrlProblem(url) {
  if (!url) return 'The API URL is required';
  if (/\{\{/.test(url)) return urlShapeProblem(url.replace(/\{\{[^}]*\}\}/g, 'x'));
  return outboundUrlProblem(url);
}

function sanitizeMapping(rows) {
  if (!Array.isArray(rows)) return { error: 'mapping must be a list' };
  if (rows.length > MAX_MAPPING_ROWS) return { error: `At most ${MAX_MAPPING_ROWS} mapping rows` };
  const mapping = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !row.fieldKey) continue;
    const source = row.source === 'FIXED' ? 'FIXED' : 'PATH';
    const value = row.value;
    if (source === 'FIXED' && value !== null && typeof value === 'object') return { error: `Fixed value for ${row.fieldKey} must be text or a number` };
    mapping.push({ fieldKey: str(row.fieldKey, 100), source, path: str(row.path), value: source === 'FIXED' ? value ?? '' : '' });
  }
  return { mapping };
}

// Reads and validates everything a create/update may set.
async function readSource(body, existing) {
  const kind = existing?.kind || body.kind;
  if (!['RECEIVE', 'PULL'].includes(kind)) return { error: 'kind must be RECEIVE or PULL' };
  const v = {};

  if (body.name !== undefined) v.name = str(body.name, 100);
  if (!existing && !v.name) return { error: 'name is required', fieldKey: 'name' };
  if (body.isEnabled !== undefined) v.isEnabled = !!body.isEnabled;
  if (body.recordsPath !== undefined) v.recordsPath = str(body.recordsPath);
  if (body.externalIdPath !== undefined) v.externalIdPath = str(body.externalIdPath);
  if (body.updateExisting !== undefined) v.updateExisting = !!body.updateExisting;
  if (body.defaultCountry !== undefined) {
    const c = str(body.defaultCountry, 2).toUpperCase();
    if (c && !/^[A-Z]{2}$/.test(c)) return { error: 'defaultCountry must be a 2-letter country code, e.g. IN', fieldKey: 'defaultCountry' };
    v.defaultCountry = c;
  }
  if (body.mapping !== undefined) {
    const m = sanitizeMapping(body.mapping);
    if (m.error) return { error: m.error, fieldKey: 'mapping' };
    v.mapping = m.mapping;
  }
  if (body.statusMap !== undefined) {
    if (!Array.isArray(body.statusMap)) return { error: 'statusMap must be a list' };
    v.statusMap = body.statusMap.slice(0, 100).filter((r) => r && r.from !== undefined && r.to).map((r) => ({ from: str(r.from), to: str(r.to) }));
  }

  if (kind === 'RECEIVE') {
    if (body.verifyAuth !== undefined) {
      const auth = sanitizeAuth(body.verifyAuth, existing?.verifyAuth);
      if (!['NONE', 'HMAC'].includes(auth.type)) return { error: 'Incoming requests can be verified with an HMAC signature only', fieldKey: 'verifyAuth' };
      const problem = await authProblem(auth);
      if (problem) return { error: problem, fieldKey: 'verifyAuth' };
      v.verifyAuth = auth;
    }
    if (body.verifyToken !== undefined) v.verifyToken = str(body.verifyToken, 200);
  }

  if (kind === 'PULL') {
    if (body.url !== undefined) v.url = str(body.url, 2000);
    const url = v.url ?? existing?.url;
    const urlProblem = await pullUrlProblem(url);
    if (urlProblem) return { error: urlProblem, fieldKey: 'url' };
    if (body.method !== undefined) {
      if (!['GET', 'POST'].includes(body.method)) return { error: 'method must be GET or POST' };
      v.method = body.method;
    }
    if (body.headers !== undefined) {
      const problem = headersProblem(body.headers);
      if (problem) return { error: problem, fieldKey: 'headers' };
      v.headers = body.headers;
    }
    if (body.bodyTemplate !== undefined) v.bodyTemplate = String(body.bodyTemplate || '').slice(0, 20000);
    if (body.auth !== undefined) {
      v.auth = sanitizeAuth(body.auth, existing?.auth);
      const problem = await authProblem(v.auth);
      if (problem) return { error: problem, fieldKey: 'auth' };
    }
    if (body.pagination !== undefined) {
      const p = body.pagination || {};
      if (p.type && !PAGINATION_TYPES.includes(p.type)) return { error: `pagination.type must be one of ${PAGINATION_TYPES.join(', ')}` };
      v.pagination = {
        type: p.type || 'NONE',
        pageSize: Math.min(Math.max(Number(p.pageSize) || 50, 1), 1000),
        startPage: Number.isInteger(Number(p.startPage)) ? Number(p.startPage) : 1,
        cursorPath: str(p.cursorPath),
        nextUrlPath: str(p.nextUrlPath),
        maxPages: Math.min(Math.max(Number(p.maxPages) || 10, 1), 50)
      };
      if (v.pagination.type === 'CURSOR' && !v.pagination.cursorPath) return { error: 'Cursor paging needs the path of the next cursor in the response' };
      if (v.pagination.type === 'NEXT_URL' && !v.pagination.nextUrlPath) return { error: 'Next-URL paging needs the path of the next page URL in the response' };
    }
    if (body.intervalMinutes !== undefined) {
      const n = Number(body.intervalMinutes);
      if (!Number.isInteger(n) || n < 5 || n > 1440) return { error: 'intervalMinutes must be 5-1440', fieldKey: 'intervalMinutes' };
      v.intervalMinutes = n;
    }
  }
  return { values: v, kind };
}

// --- Settings API (logged-in partner) ---------------------------------------

async function listSources(req, res, next) {
  try {
    const sources = await IntegrationSource.find({ partnerId: req.partnerId }).sort({ createdAt: -1 });
    return res.json({ sources: sources.map((s) => toClient(s, req)) });
  } catch (err) {
    next(err);
  }
}

async function createSource(req, res, next) {
  try {
    const { values, kind, error, fieldKey } = await readSource(req.body, null);
    if (error) return res.status(400).json({ reason: error, fieldKey });
    const count = await IntegrationSource.countDocuments({ partnerId: req.partnerId });
    if (count >= 50) return res.status(400).json({ reason: 'You can have at most 50 integration sources' });

    const source = await IntegrationSource.create({
      ...values,
      sourceId: await nextId('ISRC'),
      partnerId: req.partnerId,
      kind,
      sourceKey: kind === 'RECEIVE' ? generateSourceKey() : undefined,
      nextRunAt: kind === 'PULL' ? new Date() : null
    });
    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'INTEGRATION_SOURCE_CREATED',
      actor: req.actorLabel,
      newValue: { sourceId: source.sourceId, name: source.name, kind },
      description: `Created ${kind === 'PULL' ? 'pull' : 'receive'} source "${source.name}"`
    });
    return res.status(201).json(toClient(source, req));
  } catch (err) {
    next(err);
  }
}

async function updateSource(req, res, next) {
  try {
    const source = await IntegrationSource.findOne({ partnerId: req.partnerId, sourceId: String(req.params.sourceId) });
    if (!source) return res.status(404).json({ reason: 'Source not found' });
    const { values, error, fieldKey } = await readSource(req.body, source);
    if (error) return res.status(400).json({ reason: error, fieldKey });
    Object.assign(source, values);
    await source.save();
    return res.json(toClient(source, req));
  } catch (err) {
    next(err);
  }
}

async function deleteSource(req, res, next) {
  try {
    const source = await IntegrationSource.findOneAndDelete({ partnerId: req.partnerId, sourceId: String(req.params.sourceId) });
    if (!source) return res.status(404).json({ reason: 'Source not found' });
    await IntegrationLink.deleteMany({ connectorId: source.sourceId });
    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function regenerateSourceKey(req, res, next) {
  try {
    const source = await IntegrationSource.findOne({ partnerId: req.partnerId, sourceId: String(req.params.sourceId), kind: 'RECEIVE' });
    if (!source) return res.status(404).json({ reason: 'Source not found' });
    source.sourceKey = generateSourceKey();
    await source.save();
    return res.json(toClient(source, req));
  } catch (err) {
    next(err);
  }
}

// POST .../sources/:sourceId/test
// RECEIVE: preview mapping against { sample } in the body, or the last
//          payload actually received. PULL: fetch the first page, import nothing.
// Both return `paths` - every field in the sample, for the mapping dropdowns.
async function testSource(req, res, next) {
  try {
    const source = await IntegrationSource.findOne({ partnerId: req.partnerId, sourceId: String(req.params.sourceId) });
    if (!source) return res.status(404).json({ reason: 'Source not found' });

    // Unsaved form changes can be previewed without saving first.
    if (req.body.draft) {
      const { values, error, fieldKey } = await readSource(req.body.draft, source);
      if (error) return res.status(400).json({ reason: error, fieldKey });
      Object.assign(source, values);
    }

    let sample;
    let preview;
    let records;
    if (source.kind === 'PULL') {
      try {
        ({ sample, preview, records } = await testPull(source));
      } catch (err) {
        return res.status(400).json({ reason: `Could not fetch from the API: ${err.message}` });
      }
    } else {
      sample = req.body.sample !== undefined ? req.body.sample : source.sampleBody;
      if (sample === null || sample === undefined) {
        return res.status(400).json({ reason: 'No sample yet - send one request to the receive URL (or paste an example payload) first' });
      }
      preview = await previewPayload(source, sample);
      records = preview.length;
    }
    return res.json({ sample, records, preview, paths: listPaths(sample) });
  } catch (err) {
    next(err);
  }
}

// POST .../sources/:sourceId/run - pull now instead of waiting for the schedule.
async function runSourceNow(req, res, next) {
  try {
    const source = await IntegrationSource.findOne({ partnerId: req.partnerId, sourceId: String(req.params.sourceId), kind: 'PULL' });
    if (!source) return res.status(404).json({ reason: 'Pull source not found' });
    return res.json(await runPull(source));
  } catch (err) {
    next(err);
  }
}

// GET .../inbound-events?sourceId=&outcome=
async function listInboundEvents(req, res, next) {
  try {
    const filter = { partnerId: req.partnerId };
    if (req.query.sourceId) filter.sourceId = String(req.query.sourceId);
    if (req.query.outcome) filter.outcome = String(req.query.outcome);
    const events = await InboundEvent.find(filter).sort({ createdAt: -1 }).limit(200);
    return res.json({ events });
  } catch (err) {
    next(err);
  }
}

// --- Public receive endpoint --------------------------------------------------

const receiveCounts = new Map(); // sourceKey -> { windowStart, count }
const RECEIVE_LIMIT_PER_MINUTE = 300;

function overReceiveLimit(key) {
  const now = Date.now();
  const entry = receiveCounts.get(key);
  if (!entry || now - entry.windowStart > 60000) {
    receiveCounts.set(key, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RECEIVE_LIMIT_PER_MINUTE;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of receiveCounts) if (now - v.windowStart > 60000) receiveCounts.delete(k);
}, 60000).unref();

async function findReceiveSource(sourceKey) {
  if (!/^src_[a-f0-9]{40}$/.test(String(sourceKey))) return null;
  const source = await IntegrationSource.findOne({ sourceKey: String(sourceKey), kind: 'RECEIVE' });
  if (!source || !source.isEnabled) return null;
  const partner = await Partner.findOne({ partnerId: source.partnerId });
  return partner && partner.status === 'ACTIVE' ? source : null;
}

function bodyOf(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body;
  if (req.rawBody && req.rawBody.length) {
    try { return JSON.parse(req.rawBody.toString('utf8')); } catch { /* not JSON */ }
  }
  return null;
}

// POST /api/channel-partner/hooks/:sourceKey - anyone holding the URL can
// post leads in their own JSON or form format. Until a mapping is set up,
// payloads are only captured as a sample to build the mapping from.
async function receive(req, res, next) {
  try {
    const source = await findReceiveSource(req.params.sourceKey);
    if (!source) return res.status(404).json({ reason: 'Unknown or disabled integration URL' });
    if (overReceiveLimit(source.sourceKey)) return res.status(429).json({ reason: 'Too many requests - slow down' });

    if (source.verifyAuth?.type === 'HMAC') {
      const header = req.get(source.verifyAuth.signatureHeader || 'X-Signature');
      if (!verifyHmac(source.verifyAuth, req.rawBody || Buffer.from(''), header)) {
        return res.status(401).json({ reason: 'Signature check failed' });
      }
    }

    const body = bodyOf(req);
    if (body === null) return res.status(400).json({ reason: 'Send a JSON or form-encoded body' });

    const sampleText = JSON.stringify(body);
    await IntegrationSource.updateOne(
      { _id: source._id },
      { $set: { sampleBody: sampleText.length <= MAX_SAMPLE_CHARS ? body : { truncated: true, preview: sampleText.slice(0, MAX_SAMPLE_CHARS) } } }
    );

    if (!source.mapping || source.mapping.length === 0) {
      return res.status(202).json({ captured: true, message: 'Sample received. Map its fields in Leadrat (Settings > Integrations) to start importing leads.' });
    }
    const { summary, results } = await importPayload(source, body);
    return res.status(200).json({ ok: true, summary, results });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/hooks/:sourceKey - subscription handshake used by
// Facebook/Meta and similar: echo hub.challenge when hub.verify_token matches.
async function verifyChallenge(req, res, next) {
  try {
    const source = await findReceiveSource(req.params.sourceKey);
    if (!source) return res.status(404).json({ reason: 'Unknown or disabled integration URL' });
    const token = req.query['hub.verify_token'] ?? req.query.verify_token;
    const challenge = req.query['hub.challenge'] ?? req.query.challenge;
    if (challenge !== undefined) {
      if (!source.verifyToken || String(token) !== source.verifyToken) return res.status(403).json({ reason: 'verify_token does not match' });
      return res.type('text/plain').send(String(challenge));
    }
    return res.json({ ok: true, source: source.name, message: 'POST leads to this URL' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSources,
  createSource,
  updateSource,
  deleteSource,
  regenerateSourceKey,
  testSource,
  runSourceNow,
  listInboundEvents,
  receive,
  verifyChallenge
};

const LinkedInConnection = require('../models/LinkedInConnection');
const { PERMISSIONS } = require('../config/permissions');
const { linkedinConfig, isConfigured } = require('../config/linkedin');
const { listActivity, logActivity } = require('../services/connectorActivityService');
const connector = require('../services/linkedin/linkedinConnectorService');
const { statsReport } = require('../services/linkedin/linkedinStatsService');
const { createConversionRule, CONVERSION_TYPES } = require('../services/linkedin/linkedinCapiService');
const { ACTIVITY_TYPES } = require('../models/ConnectorActivity');

// Settings -> Connectors -> LinkedIn (section 59). Reads are open to the
// partner's team; connecting, settings and syncing need MANAGE_SETTINGS.
// Tokens never leave the server.

const canManage = (req) => (req.permissions || []).includes(PERMISSIONS.MANAGE_SETTINGS);

function toClient(conn) {
  if (!conn) return null;
  // When the partner must reconnect at the latest: the refresh token's end
  // (365 days from first consent), or the access token's (60 days) if
  // LinkedIn issued no refresh token.
  const reconnectBy = conn.refreshTokenExpiresAt || conn.accessTokenExpiresAt || null;
  return {
    connectionId: conn.connectionId,
    status: conn.status,
    memberName: conn.memberName,
    connectedBy: conn.connectedBy,
    connectedAt: conn.connectedAt,
    reconnectBy,
    autoRenews: Boolean(conn.refreshToken),
    adAccounts: conn.adAccounts.map((a) => ({
      accountUrn: a.accountUrn, name: a.name, currency: a.currency, role: a.role, status: a.status, enabled: a.enabled, realtime: Boolean(a.webhookSubscriptionId)
    })),
    settings: {
      defaultCountry: conn.settings.defaultCountry,
      syncMinutes: conn.settings.syncMinutes,
      includeTestLeads: conn.settings.includeTestLeads,
      capiEnabled: conn.settings.capiEnabled,
      capiRules: conn.settings.capiRules
    },
    lastSyncAt: conn.lastSyncAt,
    nextSyncAt: conn.nextSyncAt,
    statsSyncedAt: conn.statsSyncedAt,
    catchUpAt: conn.catchUpAt,
    lastError: conn.lastError,
    lastErrorAt: conn.lastErrorAt
  };
}

const activeConnection = (partnerId) => LinkedInConnection.findOne({ partnerId, status: { $ne: 'DISCONNECTED' } });

// GET /my/connectors - the connector catalogue with each one's state.
async function listConnectors(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    res.json({
      connectors: [{
        key: 'linkedin',
        available: isConfigured(),
        status: conn?.status || 'NOT_CONNECTED',
        memberName: conn?.memberName || '',
        adAccounts: conn ? conn.adAccounts.filter((a) => a.enabled).length : 0,
        lastSyncAt: conn?.lastSyncAt || null
      }]
    });
  } catch (err) { next(err); }
}

async function getLinkedIn(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    res.json({
      configured: isConfigured(),
      realtimeAvailable: Boolean(linkedinConfig().webhookUrl),
      canManage: canManage(req),
      connection: toClient(conn),
      conversionTypes: CONVERSION_TYPES,
      activityTypes: ACTIVITY_TYPES
    });
  } catch (err) { next(err); }
}

async function connect(req, res, next) {
  try {
    const r = await connector.startConnect(req.partnerId, req.actorLabel);
    if (r.error) return res.status(400).json({ status: 'ERROR', reason: r.error });
    res.json({ url: r.url });
  } catch (err) { next(err); }
}

// Public: LinkedIn sends the browser back here after the consent screen.
async function callback(req, res) {
  const { appUrl } = linkedinConfig();
  const page = `${appUrl}/settings/connectors/linkedin`;
  try {
    const r = await connector.completeConnect({
      state: req.query.state, code: req.query.code, error: req.query.error, errorDescription: req.query.error_description
    });
    if (r.error) return res.redirect(`${page}?error=${encodeURIComponent(r.error)}`);
    res.redirect(`${page}?connected=1`);
  } catch (err) {
    res.redirect(`${page}?error=${encodeURIComponent('Connecting LinkedIn failed')}`);
  }
}

async function updateSettings(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    if (!conn) return res.status(404).json({ status: 'ERROR', reason: 'LinkedIn is not connected' });
    const b = req.body || {};
    const s = conn.settings;
    const changes = [];

    if (b.defaultCountry !== undefined) {
      if (!/^[A-Z]{2}$/.test(String(b.defaultCountry))) return res.status(400).json({ status: 'ERROR', reason: 'Default country must be a 2-letter country code', fieldKey: 'defaultCountry' });
      s.defaultCountry = String(b.defaultCountry); changes.push(`default country ${s.defaultCountry}`);
    }
    if (b.syncMinutes !== undefined) {
      const m = Number(b.syncMinutes);
      if (!Number.isInteger(m) || m < 5 || m > 60) return res.status(400).json({ status: 'ERROR', reason: 'Sync interval must be 5-60 minutes', fieldKey: 'syncMinutes' });
      s.syncMinutes = m; changes.push(`sync every ${m} min`);
    }
    if (b.includeTestLeads !== undefined) { s.includeTestLeads = Boolean(b.includeTestLeads); changes.push(`test leads ${s.includeTestLeads ? 'on' : 'off'}`); }
    if (b.capiEnabled !== undefined) { s.capiEnabled = Boolean(b.capiEnabled); changes.push(`Conversions API ${s.capiEnabled ? 'on' : 'off'}`); }
    if (Array.isArray(b.removeCapiRules)) {
      const drop = new Set(b.removeCapiRules.map((r) => `${r.stage}|${r.accountUrn}`));
      s.capiRules = s.capiRules.filter((r) => !drop.has(`${r.stage}|${r.accountUrn}`));
      changes.push('conversion mapping removed');
    }
    if (Array.isArray(b.adAccounts)) {
      const wanted = new Map(b.adAccounts.map((a) => [a.accountUrn, Boolean(a.enabled)]));
      for (const a of conn.adAccounts) if (wanted.has(a.accountUrn)) a.enabled = wanted.get(a.accountUrn);
      changes.push(`ad accounts: ${conn.adAccounts.filter((a) => a.enabled).map((a) => a.name || a.accountUrn).join(', ') || 'none'}`);
    }
    await conn.save();
    if (changes.length) await logActivity(req.partnerId, 'SETTINGS_UPDATED', { actor: req.actorLabel, message: `Settings changed: ${changes.join('; ')}` });
    await connector.subscribeWebhooks(conn);
    res.json({ connection: toClient(conn) });
  } catch (err) { next(err); }
}

async function refreshAccounts(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    if (!conn || conn.status !== 'CONNECTED') return res.status(400).json({ status: 'ERROR', reason: 'Connect LinkedIn first' });
    await connector.refreshAccounts(conn, req.actorLabel);
    res.json({ connection: toClient(conn) });
  } catch (err) {
    if (err.status !== undefined) return res.status(502).json({ status: 'ERROR', reason: err.message });
    next(err);
  }
}

async function syncNow(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    if (!conn || conn.status !== 'CONNECTED') return res.status(400).json({ status: 'ERROR', reason: 'Connect LinkedIn first' });
    const result = await connector.runSync(conn, { force: true, actorLabel: req.actorLabel });
    res.json({ result, connection: toClient(conn) });
  } catch (err) { next(err); }
}

// Fetch leads submitted in a date range (missed leads, or history before connecting).
async function fetchRange(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    if (!conn || conn.status !== 'CONNECTED') return res.status(400).json({ status: 'ERROR', reason: 'Connect LinkedIn first' });
    const r = await connector.fetchRange(conn, { from: req.body?.from, to: req.body?.to, actorLabel: req.actorLabel });
    if (r.error) return res.status(400).json({ status: 'ERROR', reason: r.error });
    res.json({ result: { leads: r.counts, errors: r.errors }, connection: toClient(conn) });
  } catch (err) { next(err); }
}

async function disconnect(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    if (!conn) return res.status(404).json({ status: 'ERROR', reason: 'LinkedIn is not connected' });
    await connector.disconnect(conn, req.actorLabel);
    res.json({ status: 'DISCONNECTED' });
  } catch (err) { next(err); }
}

async function stats(req, res, next) {
  try {
    res.json(await statsReport(req.partnerId, { from: req.query.from, to: req.query.to }));
  } catch (err) { next(err); }
}

async function activity(req, res, next) {
  try {
    const type = ACTIVITY_TYPES.includes(req.query.type) ? req.query.type : undefined;
    const level = ['INFO', 'WARNING', 'ERROR'].includes(req.query.level) ? req.query.level : undefined;
    res.json(await listActivity(req.partnerId, { type, level, page: req.query.page, pageSize: req.query.pageSize }));
  } catch (err) { next(err); }
}

async function addConversionRule(req, res, next) {
  try {
    const conn = await activeConnection(req.partnerId);
    if (!conn || conn.status !== 'CONNECTED') return res.status(400).json({ status: 'ERROR', reason: 'Connect LinkedIn first' });
    const r = await createConversionRule(conn, { stage: req.body?.stage, accountUrn: req.body?.accountUrn, conversionType: req.body?.conversionType });
    if (r.error) return res.status(400).json({ status: 'ERROR', reason: r.error });
    res.status(201).json({ rule: r.rule, connection: toClient(conn) });
  } catch (err) {
    if (err.status !== undefined) return res.status(502).json({ status: 'ERROR', reason: err.message });
    next(err);
  }
}

// Public: LinkedIn's webhook validation (GET ?challengeCode=) ...
function webhookChallenge(req, res) {
  const code = req.query.challengeCode;
  if (!code || !isConfigured()) return res.status(400).json({ status: 'ERROR', reason: 'challengeCode required' });
  res.json(connector.challengeResponse(code));
}

// ... and lead notifications (POST, signed with the app's client secret).
function webhookReceive(req, res) {
  const raw = req.rawBody !== undefined ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  if (!connector.validSignature(raw, req.get('X-LI-Signature'))) return res.status(401).json({ status: 'ERROR', reason: 'Invalid signature' });
  // Answer at once; LinkedIn retries slow webhooks. Leads are fetched after.
  res.json({ status: 'OK' });
  connector.handleNotification(req.body).catch((err) => console.error('[linkedin] webhook', err.message));
}

module.exports = {
  listConnectors, getLinkedIn, connect, callback, updateSettings, refreshAccounts, syncNow, fetchRange, disconnect, stats, activity,
  addConversionRule, webhookChallenge, webhookReceive
};

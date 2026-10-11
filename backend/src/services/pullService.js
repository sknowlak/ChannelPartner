const IntegrationSource = require('../models/IntegrationSource');
const { performSend, renderTemplate, renderUrl } = require('./webhookService');
const { getPath } = require('../utils/jsonPath');
const { importPayload, extractRecords, previewPayload } = require('./leadImportService');

// PULL sources (section 51): Leadrat calls another system's API on a
// schedule and imports what it returns. Works with any JSON API:
// - URL/body placeholders: {{since}} (ISO time of the last successful run,
//   empty on the first), {{sinceEpoch}}, {{page}}, {{offset}}, {{limit}},
//   {{cursor}};
// - paging: NONE, PAGE (page=1,2,...), OFFSET (offset=0,50,...), CURSOR
//   (next cursor read from each response), NEXT_URL (full next-page URL
//   read from each response);
// - any auth (httpAuthService) and the same SSRF guard as outbound pushes.

const MAX_PULL_RESPONSE_CHARS = 5 * 1024 * 1024;
const HARD_MAX_PAGES = 50;
const SCHEDULER_MS = 60 * 1000;

function templateVars(source, { page, offset, cursor }) {
  const since = source.lastSince ? new Date(source.lastSince) : null;
  return {
    since: since ? since.toISOString() : '',
    sinceEpoch: since ? String(Math.floor(since.getTime() / 1000)) : '',
    page: String(page),
    offset: String(offset),
    limit: String(source.pagination?.pageSize || 50),
    cursor: cursor || ''
  };
}

async function fetchPage(source, url, vars) {
  const headers = { Accept: 'application/json', ...(source.headers || {}) };
  let body;
  if (source.method === 'POST') {
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    body = renderTemplate(source.bodyTemplate || '{}', vars, { json: true });
  }
  const out = await performSend(url, source.method || 'GET', headers, body, { auth: source.auth, maxResponseChars: MAX_PULL_RESPONSE_CHARS });
  if (out.status !== 'SUCCESS') throw new Error(out.errorMessage || `HTTP ${out.httpStatus}`);
  try {
    return JSON.parse(out.responseText);
  } catch {
    throw new Error('The API did not return JSON');
  }
}

// Walks the pages and calls onPage(json) for each. Returns pages fetched.
async function walkPages(source, onPage, { maxPages }) {
  const p = source.pagination || {};
  const type = p.type || 'NONE';
  const pageSize = p.pageSize || 50;
  let page = p.startPage ?? 1;
  let offset = 0;
  let cursor = '';
  let nextUrl = '';
  let fetched = 0;

  while (fetched < maxPages) {
    const vars = templateVars(source, { page, offset, cursor });
    const url = nextUrl || renderUrl(source.url, vars);
    const json = await fetchPage(source, url, vars);
    fetched += 1;
    const count = extractRecords(source, json).length;
    await onPage(json);

    if (type === 'NONE' || count === 0) break;
    if (type === 'PAGE') { if (count < pageSize) break; page += 1; }
    if (type === 'OFFSET') { if (count < pageSize) break; offset += pageSize; }
    if (type === 'CURSOR') {
      const next = getPath(json, p.cursorPath);
      if (!next || next === cursor) break;
      cursor = String(next);
    }
    if (type === 'NEXT_URL') {
      const next = getPath(json, p.nextUrlPath);
      if (!next || typeof next !== 'string' || next === nextUrl) break;
      nextUrl = new URL(next, source.url).toString();
    }
  }
  return fetched;
}

// "Test" in the UI: first page only, nothing imported. Returns the raw
// response (for picking fields to map) and what the records would become.
async function testPull(source) {
  let sample = null;
  await walkPages(source, async (json) => { sample = json; }, { maxPages: 1 });
  return { sample, records: extractRecords(source, sample).length, preview: await previewPayload(source, sample) };
}

// One real run. {{since}} for the next run is this run's START time, so
// records changed while it was running are picked up next time.
async function runPull(source) {
  const startedAt = new Date();
  const totals = { pages: 0, received: 0, CREATED: 0, UPDATED: 0, UNCHANGED: 0, DUPLICATE: 0, REJECTED: 0, FAILED: 0 };
  let error = '';
  try {
    totals.pages = await walkPages(source, async (json) => {
      const { summary } = await importPayload(source, json);
      for (const [k, v] of Object.entries(summary)) totals[k] = (totals[k] || 0) + v;
    }, { maxPages: Math.min(source.pagination?.maxPages || 10, HARD_MAX_PAGES) });
  } catch (err) {
    error = err.message;
  }

  const update = {
    lastRunAt: startedAt,
    lastResult: { ...totals, error, finishedAt: new Date() },
    nextRunAt: new Date(Date.now() + (source.intervalMinutes || 15) * 60 * 1000)
  };
  if (!error) update.lastSince = startedAt;
  await IntegrationSource.updateOne({ _id: source._id }, { $set: update });
  return update.lastResult;
}

// Every minute: claim due sources one at a time (pushing nextRunAt forward
// atomically, so two backend instances never run the same source) and run them.
let running = false;
async function processDuePulls() {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < 20; i += 1) {
      const now = new Date();
      const source = await IntegrationSource.findOneAndUpdate(
        { kind: 'PULL', isEnabled: true, $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }] },
        { $set: { nextRunAt: new Date(now.getTime() + 10 * 60 * 1000) } }, // lease; runPull sets the real next time
        { sort: { nextRunAt: 1 }, new: true }
      );
      if (!source) break;
      await runPull(source).catch((err) => console.error('[integrations] pull failed', source.sourceId, err));
    }
  } finally {
    running = false;
  }
}

function startPullScheduler() {
  const tick = () => processDuePulls().catch((err) => console.error('[integrations] pull scheduler failed', err));
  return setInterval(tick, SCHEDULER_MS);
}

module.exports = { runPull, testPull, startPullScheduler, processDuePulls };

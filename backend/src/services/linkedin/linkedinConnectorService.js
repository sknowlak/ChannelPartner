const crypto = require('crypto');
const LinkedInConnection = require('../../models/LinkedInConnection');
const ConnectorOAuthState = require('../../models/ConnectorOAuthState');
const { nextId } = require('../../utils/idGenerator');
const { linkedinConfig, isConfigured } = require('../../config/linkedin');
const { logActivity } = require('../connectorActivityService');
const api = require('./linkedinApi');
const { syncLeads, importLeadById, ensureLeadSourceOption } = require('./linkedinLeadService');
const { syncStats } = require('./linkedinStatsService');
const { retryDueConversions } = require('./linkedinCapiService');

// LinkedIn connector lifecycle (section 59): connect (OAuth), choose ad
// accounts, scheduled sync (leads every few minutes, ad stats every few
// hours), real-time lead webhooks when a public URL is configured, and
// disconnect. Errors are written to the activity log; an expired
// connection stops syncing until the partner reconnects.

const SCHEDULER_MS = 60 * 1000;
const STATS_EVERY_MS = 3 * 60 * 60 * 1000;
const LEASE_MS = 10 * 60 * 1000;
const CATCH_UP_EVERY_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_DAYS = 7;
const MAX_RANGE_DAYS = 90;

// ---- connect / disconnect ---------------------------------------------

async function startConnect(partnerId, actorLabel) {
  if (!isConfigured()) return { error: 'LinkedIn is not set up on this server yet (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET)' };
  const state = crypto.randomBytes(24).toString('hex');
  await ConnectorOAuthState.create({ state, connector: 'LINKEDIN', partnerId, actorLabel });
  return { url: api.authorizeUrl(state) };
}

// OAuth callback: exchanges the code, saves the (encrypted) tokens, loads
// the member's ad accounts. Returns { partnerId } or { error }.
async function completeConnect({ state, code, error, errorDescription }) {
  const pending = state ? await ConnectorOAuthState.findOneAndDelete({ state: String(state), connector: 'LINKEDIN' }) : null;
  if (!pending) return { error: 'This LinkedIn sign-in link has expired - start again from Settings' };
  const { partnerId, actorLabel } = pending;
  if (error) {
    // unauthorized_scope_error: the Leadrat app isn't approved yet for a
    // LinkedIn product the connector needs (not something the partner did).
    // LinkedIn's description arrives HTML-escaped (Scope &quot;r_ads&quot; ...).
    const said = String(errorDescription || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const reason = error === 'unauthorized_scope_error'
      ? `LinkedIn refused a permission the connector needs (${said || 'unauthorized scope'}). The Leadrat LinkedIn app must have the Advertising API, Lead Sync API and Conversions API products approved in the LinkedIn developer portal`
      : said || error;
    await logActivity(partnerId, 'ERROR', { level: 'WARNING', actor: actorLabel, message: `LinkedIn connection was not completed: ${reason}` });
    return { partnerId, error: reason };
  }
  try {
    const tokens = await api.exchangeCode(String(code || ''));
    let conn = await LinkedInConnection.findOne({ partnerId });
    if (!conn) conn = new LinkedInConnection({ connectionId: await nextId('LIC'), partnerId });
    Object.assign(conn, api.tokenFields(tokens), {
      status: 'CONNECTED', connectedBy: actorLabel, connectedAt: new Date(), lastError: '', lastErrorAt: null, nextSyncAt: new Date()
    });
    const profile = await api.memberProfile(conn);
    conn.memberName = profile.name;
    conn.memberUrn = profile.urn;

    const loaded = await loadAdAccounts(conn);
    await conn.save();
    await ensureLeadSourceOption(partnerId);
    await logActivity(partnerId, 'CONNECTED', {
      actor: actorLabel,
      message: `Connected as ${conn.memberName || 'LinkedIn member'} - ${loaded.warning ? 'ad accounts could not be read' : `${conn.adAccounts.length} ad account(s) found`}`
        + `${tokens.refresh_token ? '' : ' - access lasts 60 days (LinkedIn issued no refresh token)'}`,
      details: { adAccounts: conn.adAccounts.map((a) => a.name || a.accountUrn), refreshToken: Boolean(tokens.refresh_token) }
    });
    if (loaded.warning) await logActivity(partnerId, 'ERROR', { level: 'WARNING', actor: actorLabel, message: loaded.warning });
    await subscribeWebhooks(conn);
    return { partnerId };
  } catch (err) {
    await logActivity(partnerId, 'ERROR', { level: 'ERROR', actor: actorLabel, message: `Connecting LinkedIn failed: ${err.message}` });
    return { partnerId, error: err.message };
  }
}

const NO_ADS_ACCESS = 'LinkedIn did not let Leadrat read ad accounts (403 "Not enough permissions"). The Leadrat LinkedIn app needs the Advertising API, '
  + 'Lead Sync API and Conversions API products approved in the LinkedIn developer portal; then reconnect LinkedIn so the new permissions are granted.';

// Loads the member's ad accounts into conn.adAccounts, keeping each
// account's sync switch. If LinkedIn refuses (the app's Advertising API
// product is not approved yet), the connection is kept - with a warning
// shown on the page - instead of failing the whole connect.
async function loadAdAccounts(conn) {
  try {
    const accounts = await api.listAdAccounts(conn);
    const before = new Map(conn.adAccounts.map((a) => [a.accountUrn, a]));
    conn.adAccounts = accounts.map((a) => ({ ...a, enabled: before.get(a.accountUrn)?.enabled ?? true, webhookSubscriptionId: before.get(a.accountUrn)?.webhookSubscriptionId || '' }));
    return {};
  } catch (err) {
    if (err.status !== 403) throw err;
    conn.lastError = NO_ADS_ACCESS;
    conn.lastErrorAt = new Date();
    return { warning: NO_ADS_ACCESS };
  }
}

async function refreshAccounts(conn, actorLabel) {
  const loaded = await loadAdAccounts(conn);
  if (!loaded.warning && conn.lastError === NO_ADS_ACCESS) { conn.lastError = ''; conn.lastErrorAt = null; }
  await conn.save();
  await logActivity(conn.partnerId, loaded.warning ? 'ERROR' : 'SETTINGS_UPDATED', {
    actor: actorLabel,
    level: loaded.warning ? 'WARNING' : 'INFO',
    message: loaded.warning || `Ad accounts refreshed - ${conn.adAccounts.length} found`
  });
  await subscribeWebhooks(conn);
  return conn;
}

async function disconnect(conn, actorLabel) {
  await unsubscribeWebhooks(conn);
  Object.assign(conn, {
    status: 'DISCONNECTED', accessToken: '', refreshToken: '', accessTokenExpiresAt: null, refreshTokenExpiresAt: null,
    settings: { ...conn.settings.toObject(), capiEnabled: false }
  });
  await conn.save();
  await logActivity(conn.partnerId, 'DISCONNECTED', {
    actor: actorLabel,
    message: 'LinkedIn disconnected - tokens deleted. Leads, statistics and this log are kept. To also remove Leadrat from the LinkedIn account: LinkedIn Settings > Data privacy > Permitted services.'
  });
}

// ---- real-time lead notifications (optional) ---------------------------

async function subscribeWebhooks(conn) {
  const { webhookUrl } = linkedinConfig();
  if (!webhookUrl || conn.status !== 'CONNECTED') return;
  let changed = false;
  for (const account of conn.adAccounts) {
    if (!account.enabled || account.webhookSubscriptionId) continue;
    try {
      const r = await api.liRequest(conn, 'POST', '/leadNotifications', {
        body: { webhook: webhookUrl, owner: { sponsoredAccount: account.accountUrn }, leadType: 'SPONSORED' }
      });
      account.webhookSubscriptionId = r.headers.get('x-restli-id') || r.data?.id || 'subscribed';
      changed = true;
      await logActivity(conn.partnerId, 'WEBHOOK_SUBSCRIBED', { message: `Real-time lead notifications on for ${account.name || account.accountUrn}` });
    } catch (err) {
      await logActivity(conn.partnerId, 'ERROR', { level: 'WARNING', message: `Real-time lead notifications could not be turned on for ${account.name || account.accountUrn} (${err.message}) - leads still arrive by scheduled sync` });
    }
  }
  if (changed) await conn.save();
}

async function unsubscribeWebhooks(conn) {
  for (const account of conn.adAccounts) {
    if (!account.webhookSubscriptionId || account.webhookSubscriptionId === 'subscribed') { account.webhookSubscriptionId = ''; continue; }
    await api.liRequest(conn, 'DELETE', `/leadNotifications/${encodeURIComponent(account.webhookSubscriptionId)}`).catch(() => {});
    account.webhookSubscriptionId = '';
  }
}

// LinkedIn validates the webhook URL: reply with HMAC-SHA256(clientSecret, challengeCode).
function challengeResponse(challengeCode) {
  const { clientSecret } = linkedinConfig();
  return { challengeCode, challengeResponse: crypto.createHmac('sha256', clientSecret).update(String(challengeCode)).digest('hex') };
}

// X-LI-Signature = hex(HMAC-SHA256(clientSecret, "hmacsha256=" + raw body)).
function validSignature(rawBody, signature) {
  const { clientSecret } = linkedinConfig();
  if (!clientSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', clientSecret).update(`hmacsha256=${rawBody}`).digest('hex');
  const given = String(signature).replace(/^hmacsha256=/, '');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// A verified notification: fetch the lead and import it for every partner
// syncing that ad account. LEAD_ACTION DELETED is only logged.
async function handleNotification(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  for (const n of items) {
    const accountUrn = n?.owner?.sponsoredAccount;
    const leadUrn = n?.leadGenFormResponse;
    if (!accountUrn || !leadUrn) continue;
    const conns = await LinkedInConnection.find({ status: 'CONNECTED', adAccounts: { $elemMatch: { accountUrn, enabled: true } } });
    for (const conn of conns) {
      await logActivity(conn.partnerId, 'WEBHOOK_RECEIVED', { message: `LinkedIn: lead ${n.leadAction === 'DELETED' ? 'deleted by the member' : 'submitted'}`, externalId: api.idOf(leadUrn) });
      if (n.leadAction === 'DELETED') continue;
      await importLeadById(conn, leadUrn, accountUrn).catch((err) =>
        logActivity(conn.partnerId, 'ERROR', { level: 'ERROR', message: `Fetching a notified lead failed: ${err.message} - the next scheduled sync will pick it up` }));
    }
  }
}

// ---- sync ----------------------------------------------------------------

async function markNeedsReconnect(conn, err) {
  conn.status = 'EXPIRED';
  conn.lastError = err.message;
  conn.lastErrorAt = new Date();
  await conn.save();
  await logActivity(conn.partnerId, 'RECONNECT_NEEDED', { level: 'ERROR', message: `${err.message}. Syncing is paused until LinkedIn is reconnected.` });
}

const dayText = (ms) => new Date(ms).toISOString().slice(0, 10);

// One lead sync (regular, catch-up or date range) + its activity-log line.
async function syncAndLog(conn, { range = null, label, actorLabel }) {
  const leads = await syncLeads(conn, range);
  const c = leads.counts;
  await logActivity(conn.partnerId, 'LEAD_SYNC', {
    actor: actorLabel,
    level: leads.errors.length ? 'ERROR' : 'INFO',
    message: `${label}: ${c.received} received - ${c.CREATED} created, ${c.DUPLICATE} duplicate, ${c.REJECTED} rejected, ${c.FAILED} failed`
      + `${c.skipped ? `, ${c.skipped} already imported` : ''}${leads.errors.length ? ` | ${leads.errors.join('; ')}` : ''}`,
    details: { ...c, ...(range ? { from: dayText(range.start), to: dayText(range.end) } : {}) }
  });
  return leads;
}

const addCounts = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] || 0)]));

// Leads (always) + ad stats (when due or forced). Once a day - and on every
// "Sync now" - the last CATCH_UP_DAYS are re-checked as well, so a lead
// missed by a failed webhook or a late LinkedIn update is still imported.
// Returns a summary.
async function runSync(conn, { force = false, actorLabel = 'Scheduler' } = {}) {
  const startedAt = new Date();
  const result = { leads: null, stats: null, errors: [] };
  try {
    const leads = await syncAndLog(conn, { label: 'Lead sync', actorLabel });
    result.leads = leads.counts;
    result.errors.push(...leads.errors);

    if (force || !conn.catchUpAt || Date.now() - conn.catchUpAt.getTime() > CATCH_UP_EVERY_MS) {
      const now = Date.now();
      const catchUp = await syncAndLog(conn, { range: { start: now - CATCH_UP_DAYS * 86400000, end: now }, label: `Catch-up (last ${CATCH_UP_DAYS} days)`, actorLabel });
      result.leads = addCounts(result.leads, catchUp.counts);
      result.errors.push(...catchUp.errors);
      if (!catchUp.errors.length) conn.catchUpAt = new Date();
    }

    if (force || !conn.statsSyncedAt || Date.now() - conn.statsSyncedAt.getTime() > STATS_EVERY_MS) {
      const stats = await syncStats(conn);
      result.stats = { rows: stats.rows };
      result.errors.push(...stats.errors);
      await logActivity(conn.partnerId, 'STATS_SYNC', {
        actor: actorLabel,
        level: stats.errors.length ? 'ERROR' : 'INFO',
        message: `Ad statistics refreshed: ${stats.rows} campaign-day row(s)${stats.errors.length ? ` | ${stats.errors.join('; ')}` : ''}`
      });
    }
    // Without readable ad accounts the "no ads access" warning stays visible.
    const keepWarning = !result.errors.length && conn.lastError === NO_ADS_ACCESS && !conn.adAccounts.length;
    if (!keepWarning) {
      conn.lastError = result.errors.join('; ').slice(0, 1000);
      conn.lastErrorAt = result.errors.length ? new Date() : conn.lastErrorAt;
    }
  } catch (err) {
    if (err.needsReconnect) await markNeedsReconnect(conn, err);
    else {
      conn.lastError = err.message;
      conn.lastErrorAt = new Date();
      await logActivity(conn.partnerId, 'ERROR', { level: 'ERROR', actor: actorLabel, message: `Sync failed: ${err.message}` });
    }
    result.errors.push(err.message);
  }
  conn.lastSyncAt = startedAt;
  conn.nextSyncAt = new Date(Date.now() + (conn.settings.syncMinutes || 10) * 60000);
  await conn.save();
  return result;
}

// A partner's "fetch leads by date range" (YYYY-MM-DD, inclusive, UTC).
async function fetchRange(conn, { from, to, actorLabel }) {
  const valid = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d));
  if (!valid(from) || !valid(to)) return { error: 'Choose a start and an end date' };
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Math.min(Date.parse(`${to}T23:59:59.999Z`), Date.now());
  if (start > end) return { error: 'The start date must be on or before the end date' };
  if (end - start > MAX_RANGE_DAYS * 86400000) return { error: `Choose at most ${MAX_RANGE_DAYS} days at a time` };
  try {
    const leads = await syncAndLog(conn, { range: { start, end }, label: `Fetched by date range ${from} - ${to}`, actorLabel });
    await conn.save();
    return { counts: leads.counts, errors: leads.errors };
  } catch (err) {
    if (err.needsReconnect) await markNeedsReconnect(conn, err);
    return { error: err.message };
  }
}

let running = false;
async function processDueConnections() {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < 20; i++) {
      const now = new Date();
      const conn = await LinkedInConnection.findOneAndUpdate(
        { status: 'CONNECTED', nextSyncAt: { $lte: now } },
        { $set: { nextSyncAt: new Date(now.getTime() + LEASE_MS) } },
        { new: true }
      );
      if (!conn) break;
      await runSync(conn).catch((err) => console.error('[linkedin] sync failed', err.message));
    }
    await retryDueConversions();
  } finally {
    running = false;
  }
}

function startLinkedInScheduler() {
  setInterval(() => processDueConnections().catch((err) => console.error('[linkedin] scheduler', err.message)), SCHEDULER_MS);
}

module.exports = {
  startConnect, completeConnect, refreshAccounts, disconnect, runSync, fetchRange, processDueConnections, startLinkedInScheduler,
  challengeResponse, validSignature, handleNotification, subscribeWebhooks
};

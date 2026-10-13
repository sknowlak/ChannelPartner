const IntegrationWebhook = require('../models/IntegrationWebhook');
const WebhookDelivery = require('../models/WebhookDelivery');
const Registration = require('../models/Registration');
const { contactView } = require('../utils/contact');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { outboundUrlProblem } = require('../utils/outboundUrl');
const { redactHeaders, restoreRedacted } = require('../utils/secretHeaders');
const IntegrationLink = require('../models/IntegrationLink');
const { applyAuth, invalidateToken } = require('./httpAuthService');
const { getPath } = require('../utils/jsonPath');

const SEND_TIMEOUT_MS = 10000;
const MAX_RESPONSE_CHARS = 2000;
// Enough of a create response to read the target's new record ID from.
const LINK_RESPONSE_CHARS = 64 * 1024;
// Resync is a manual, synchronous action - bounded so one click can't send
// for hours or flood the target. Narrow the date range to push more.
const RESYNC_MAX_LEADS = 500;
const RESYNC_CONCURRENCY = 5;
const resyncsInProgress = new Set();

// The shape sent to every external client, regardless of format (section
// 43) - a flat, self-describing snapshot of the lead at the moment of the
// event. `customFields` is passed through as-is (JSON/CUSTOM formats keep
// it nested; FORM flattens it like everything else, see flattenForForm).
// `partner` is the channel partner who owns the lead - a receiving CRM
// usually wants to know which partner sent it (ChannelPartnerName etc.).
// `customer` is the lead's OWN contact copy (section 52), never the shared
// Customer record another partner may have filled in.
function buildLeadPayload(registration, _legacyCustomerArg, eventType, partner) {
  const reg = registration.toObject ? registration.toObject() : registration;
  const customer = contactView(reg);
  return {
    event: eventType,
    timestamp: new Date().toISOString(),
    registrationId: reg.registrationId,
    projectId: reg.projectId || '',
    stage: reg.currentStage,
    subStatus: reg.subStatus || '',
    isBooked: !!reg.isBooked,
    requirementType: reg.requirementType || '',
    propertyType: reg.propertyType || '',
    bhk: reg.bhk || '',
    budgetMin: reg.budgetMin,
    budgetMax: reg.budgetMax,
    preferredLocation: reg.preferredLocation || '',
    possessionTimeline: reg.possessionTimeline || '',
    leadSource: reg.leadSource || '',
    notes: reg.notes || '',
    customFields: reg.customFields || {},
    customer: {
      name: customer.name,
      mobile: customer.mobile,
      countryCode: customer.mobileDialCode,
      nationalNumber: customer.mobileNationalNumber,
      email: customer.email,
      alternateMobile: customer.alternateMobile
    },
    partner: partner ? { name: partner.name, mobile: partner.mobile, email: partner.email, companyName: partner.companyName || '' } : null
  };
}

function flattenForForm(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenForForm(value, flatKey));
    } else {
      out.push([flatKey, Array.isArray(value) ? value.join(',') : String(value ?? '')]);
    }
  }
  return out;
}

// {{path.to.value}} substitution against the payload object - deliberately
// simple (no logic/loops) so a partner can paste in exactly the JSON/XML/
// form body their system expects, "like a cURL --data body you fill in once".
//
// With `json: true` (the body is sent as JSON) values are JSON-escaped, so a
// quote or line break in e.g. notes can't break the body, and a placeholder
// that IS the whole string value ("Email": "{{customer.email}}") becomes
// `null` when the lead has no value - matching how most CRM APIs (e.g.
// Leadrat's webhook) expect "not provided" to look, rather than "".
function lookupPath(payload, path) {
  const value = path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), payload);
  if (value === undefined || value === null || value === '') return null;
  return Array.isArray(value) ? value.join(',') : String(value);
}

// `escape` covers the other body types a template can be: 'form'
// URL-encodes each value and 'xml' escapes markup, so lead text like
// `x&stage=Booked` or `</Name><Status>Booked` can't inject extra fields or
// elements into the client CRM's request.
const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const ESCAPERS = {
  form: (v) => encodeURIComponent(v),
  xml: (v) => v.replace(/[&<>"']/g, (c) => XML_ENTITIES[c])
};

function renderTemplate(template, payload, { json = false, escape } = {}) {
  let out = template;
  if (json) {
    out = out.replace(/"\{\{\s*([\w.]+)\s*\}\}"/g, (_, path) => JSON.stringify(lookupPath(payload, path)));
  }
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = lookupPath(payload, path) ?? '';
    if (json) return JSON.stringify(value).slice(1, -1);
    return ESCAPERS[escape] ? ESCAPERS[escape](value) : value;
  });
}

function escapeModeFor(contentType) {
  if (/json/i.test(contentType)) return { json: true };
  if (/x-www-form-urlencoded/i.test(contentType)) return { escape: 'form' };
  if (/xml/i.test(contentType)) return { escape: 'xml' };
  return {};
}

const BODYLESS_METHODS = ['GET', 'HEAD'];
// Wait before automatic retry N (minutes): 1, 5, 30, 2h, 6h.
const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const RETRY_SCHEDULER_MS = 30 * 1000;

function buildRequest(webhook, payload, { bodyTemplate = webhook.bodyTemplate, method = webhook.method } = {}) {
  const headers = { ...(webhook.headers || {}) };
  if (BODYLESS_METHODS.includes(method)) return { headers, body: undefined };
  let body;

  if (webhook.format === 'FORM') {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams();
    for (const [key, value] of flattenForForm(payload)) params.append(key, value);
    body = params.toString();
  } else if (webhook.format === 'CUSTOM' && bodyTemplate) {
    const contentTypeKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
    if (!contentTypeKey) headers['Content-Type'] = 'application/json';
    const contentType = contentTypeKey ? String(headers[contentTypeKey]) : 'application/json';
    body = renderTemplate(bodyTemplate, payload, escapeModeFor(contentType));
  } else {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }

  return { headers, body };
}

// {{placeholders}} in a URL are URL-encoded, e.g. .../leads/{{external.id}}.
function renderUrl(urlTemplate, payload) {
  return renderTemplate(urlTemplate, payload, { escape: 'form' });
}

// Reads at most `limit` characters and then stops, so a target streaming a
// huge response can't balloon the server's memory.
async function readCapped(res, limit) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (text.length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text.slice(0, limit);
}

// One outbound HTTP call - shared by push webhooks, pull sources and
// notification-rule webhooks. The URL is re-checked right before every send
// (utils/outboundUrl.js) and redirects are not followed. `auth` is applied
// last (httpAuthService), so tokens/keys/signatures never reach the caller's
// log; an OAuth2 401 refreshes the token and retries once.
//
// Result: { status, httpStatus, responseBody (first 2000 chars, for the log),
// responseText (up to maxResponseChars, for parsing), errorMessage, retryable }.
async function performSend(url, method, headers, body, { auth, maxResponseChars = MAX_RESPONSE_CHARS } = {}) {
  const result = { status: 'FAILED', httpStatus: null, responseBody: '', responseText: '', errorMessage: '', retryable: false };
  const problem = await outboundUrlProblem(url);
  if (problem) {
    result.errorMessage = `Blocked: ${problem}`;
    return result;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let request;
    try {
      request = await applyAuth(auth, { url, headers, body });
    } catch (err) {
      result.errorMessage = err.message;
      result.retryable = true;
      return result;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(request.url, {
        method,
        headers: request.headers,
        body: BODYLESS_METHODS.includes(method) ? undefined : body,
        signal: controller.signal,
        redirect: 'manual'
      });
      result.httpStatus = res.status;

      if (res.status === 401 && auth?.type === 'OAUTH2' && attempt === 0) {
        res.body?.cancel().catch(() => {});
        invalidateToken(auth); // expired/revoked token - fetch a fresh one and try once more
        continue;
      }
      if (res.status >= 300 && res.status < 400) {
        result.errorMessage = `Server responded with a redirect (HTTP ${res.status}) - redirects are not followed; use the final URL`;
        res.body?.cancel().catch(() => {});
        return result;
      }
      result.responseText = await readCapped(res, Math.max(maxResponseChars, MAX_RESPONSE_CHARS));
      result.responseBody = result.responseText.slice(0, MAX_RESPONSE_CHARS);
      result.status = res.ok ? 'SUCCESS' : 'FAILED';
      if (!res.ok) {
        result.errorMessage = `Server responded with HTTP ${res.status}`;
        result.retryable = res.status === 429 || res.status >= 500;
      }
      return result;
    } catch (err) {
      result.errorMessage = err.name === 'AbortError' ? `Request timed out after ${SEND_TIMEOUT_MS / 1000}s` : err.message;
      result.retryable = true;
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  return result;
}

// Which request a push uses for this lead (section 51). In CREATE_UPDATE
// mode, the create request is used until the target's own ID for the lead
// is known; after that, the update request.
async function resolveOperation(webhook, registrationId) {
  const link = await IntegrationLink.findOne({ connectorId: webhook.webhookId, registrationId });
  if (webhook.mode === 'CREATE_UPDATE' && link && webhook.updateUrl) {
    return {
      operation: 'UPDATE',
      link,
      url: webhook.updateUrl,
      method: webhook.updateMethod || 'PUT',
      bodyTemplate: webhook.updateBodyTemplate || webhook.bodyTemplate
    };
  }
  return {
    operation: webhook.mode === 'CREATE_UPDATE' ? 'CREATE' : 'SEND',
    link,
    url: webhook.targetUrl,
    method: webhook.method || 'POST',
    bodyTemplate: webhook.bodyTemplate
  };
}

// After a successful create, remember the target's ID for this lead.
async function recordExternalId(webhook, registrationId, outcome) {
  if (!webhook.responseIdPath || outcome.status !== 'SUCCESS') return;
  let parsed;
  try { parsed = JSON.parse(outcome.responseText); } catch { return; }
  const externalId = getPath(parsed, webhook.responseIdPath);
  if (externalId === undefined || externalId === null || externalId === '' || typeof externalId === 'object') return;
  await IntegrationLink.findOneAndUpdate(
    { connectorId: webhook.webhookId, registrationId },
    { $set: { partnerId: webhook.partnerId, externalId: String(externalId) } },
    { upsert: true }
  ).catch(() => {}); // another lead already claims that ID - leave the existing link alone
}

function nextRetryAt(webhook, attempt, outcome) {
  const maxRetries = webhook?.maxRetries ?? 3;
  if (outcome.status === 'SUCCESS' || !outcome.retryable || attempt > maxRetries) return null;
  const minutes = RETRY_BACKOFF_MINUTES[Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000);
}

function storedOutcome(outcome) {
  const { responseText, retryable, ...rest } = outcome; // eslint-disable-line no-unused-vars
  return rest;
}

// Sends one webhook and always writes a WebhookDelivery row - "I should get
// all updates failed, pass, or where its problem" - never throws, so a
// caller doing Promise.all() across several webhooks can't have one bad
// target blow up the others.
async function sendWebhook(webhook, basePayload, eventType, registrationId, partnerId) {
  const op = await resolveOperation(webhook, registrationId);
  const payload = { ...basePayload, external: { id: op.link?.externalId || '' } };
  const { headers, body } = buildRequest(webhook, payload, { bodyTemplate: op.bodyTemplate, method: op.method });
  const url = renderUrl(op.url, payload);

  const outcome = await performSend(url, op.method, headers, body, { auth: webhook.auth, maxResponseChars: LINK_RESPONSE_CHARS });
  if (op.operation !== 'UPDATE') await recordExternalId(webhook, registrationId, outcome);

  const deliveryId = await nextId('DLV');
  await WebhookDelivery.create({
    deliveryId,
    webhookId: webhook.webhookId,
    partnerId,
    registrationId,
    eventType,
    operation: op.operation,
    // Logged before auth is applied, and with credential-like headers
    // redacted: retries take secrets from the live webhook config instead.
    requestUrl: url,
    requestMethod: op.method,
    requestHeaders: redactHeaders(headers),
    requestBody: body,
    ...storedOutcome(outcome),
    nextRetryAt: nextRetryAt(webhook, 1, outcome)
  });

  return { deliveryId, ...storedOutcome(outcome) };
}

// Fire-and-forget from the caller's point of view (myLeadsController never
// awaits this) - a slow or dead external target must never slow down or
// fail the partner's own API response.
async function triggerWebhooks(partnerId, eventType, registration) {
  // Every lead event also reaches the LinkedIn Conversions API (section 59);
  // required lazily - linkedinCapiService -> ... -> myLeadsController -> here.
  require('./linkedin/linkedinCapiService').onLeadEvent(partnerId, eventType, registration) // eslint-disable-line global-require
    .catch((err) => console.error('[linkedin] conversion', err.message));
  const webhooks = await IntegrationWebhook.find({ partnerId, isEnabled: true, events: eventType });
  if (webhooks.length === 0) return;
  const partner = await Partner.findOne({ partnerId });
  const payload = buildLeadPayload(registration, null, eventType, partner);
  await Promise.all(webhooks.map((wh) =>
    sendWebhook(wh, payload, eventType, registration.registrationId, partnerId).catch(() => {})
  ));
}

// Re-sends the EXACT request that was originally built (same URL/method/
// headers/body) rather than re-deriving it from the lead's current state -
// a retry should reproduce the original attempt, not silently send
// whatever the lead looks like now. Auth is applied fresh (a new OAuth2
// token, a new signature). Used by the Retry button and the automatic
// retry scheduler.
async function retryDelivery(partnerId, deliveryId) {
  const delivery = await WebhookDelivery.findOne({ deliveryId, partnerId });
  if (!delivery) return { error: 'Delivery not found' };

  const webhook = await IntegrationWebhook.findOne({ webhookId: delivery.webhookId, partnerId });
  const headers = restoreRedacted(delivery.requestHeaders, webhook?.headers);
  const outcome = await performSend(delivery.requestUrl, delivery.requestMethod, headers, delivery.requestBody, {
    auth: webhook?.auth,
    maxResponseChars: LINK_RESPONSE_CHARS
  });
  if (webhook && delivery.operation !== 'UPDATE') await recordExternalId(webhook, delivery.registrationId, outcome);

  delivery.status = outcome.status;
  delivery.httpStatus = outcome.httpStatus;
  delivery.responseBody = outcome.responseBody;
  delivery.errorMessage = outcome.errorMessage;
  delivery.attempt += 1;
  delivery.nextRetryAt = nextRetryAt(webhook, delivery.attempt, outcome);
  await delivery.save();
  return { delivery };
}

// Automatic retries: failed deliveries whose nextRetryAt has passed are
// claimed one at a time (clearing nextRetryAt atomically, so two backend
// instances can't both retry the same one) and re-sent.
let retrying = false;
async function processDueRetries() {
  if (retrying) return;
  retrying = true;
  try {
    for (let i = 0; i < 50; i += 1) {
      const due = await WebhookDelivery.findOneAndUpdate(
        { nextRetryAt: { $ne: null, $lte: new Date() }, status: 'FAILED' },
        { $set: { nextRetryAt: null } },
        { sort: { nextRetryAt: 1 } }
      );
      if (!due) break;
      await retryDelivery(due.partnerId, due.deliveryId).catch((err) => console.error('[webhooks] retry failed', err));
    }
  } finally {
    retrying = false;
  }
}

function startRetryScheduler() {
  const tick = () => processDueRetries().catch((err) => console.error('[webhooks] retry scheduler failed', err));
  return setInterval(tick, RETRY_SCHEDULER_MS);
}

// Manual "push leads in this date range again" (section 43) - bypasses the
// webhook's configured `events` filter (an explicit resync request should
// go through regardless), tagged with its own SYNC event type so it's
// distinguishable from organic activity in the delivery log.
async function resyncRange(partnerId, webhookId, fromDate, toDate) {
  const webhook = await IntegrationWebhook.findOne({ webhookId, partnerId });
  if (!webhook) return { error: 'Webhook not found' };

  const query = { partnerId };
  if (fromDate || toDate) {
    query.registeredAt = {};
    if (fromDate) query.registeredAt.$gte = new Date(fromDate);
    if (toDate) query.registeredAt.$lte = new Date(`${toDate}T23:59:59.999Z`);
  }

  const lockKey = `${partnerId}:${webhookId}`;
  if (resyncsInProgress.has(lockKey)) return { error: 'A resync for this webhook is already running', status: 409 };
  resyncsInProgress.add(lockKey);

  try {
    const matching = await Registration.countDocuments(query);
    const registrations = await Registration.find(query).sort({ registeredAt: 1 }).limit(RESYNC_MAX_LEADS);
    const partner = await Partner.findOne({ partnerId });

    const queue = [...registrations];
    const worker = async () => {
      while (queue.length) {
        const reg = queue.shift();
        const payload = buildLeadPayload(reg, null, 'SYNC', partner);
        await sendWebhook(webhook, payload, 'SYNC', reg.registrationId, partnerId).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: RESYNC_CONCURRENCY }, worker));

    return { total: registrations.length, matching, truncated: matching > registrations.length, limit: RESYNC_MAX_LEADS };
  } finally {
    resyncsInProgress.delete(lockKey);
  }
}

// "Send test" from the webhook form: pushes one real lead (or the most
// recent one) through this webhook right now and returns what happened.
async function sendTestPush(partnerId, webhookId, registrationId) {
  const webhook = await IntegrationWebhook.findOne({ webhookId, partnerId });
  if (!webhook) return { error: 'Webhook not found' };
  const reg = registrationId
    ? await Registration.findOne({ partnerId, registrationId: String(registrationId) })
    : await Registration.findOne({ partnerId }).sort({ registeredAt: -1 });
  if (!reg) return { error: 'No lead to test with - register a lead first' };
  const partner = await Partner.findOne({ partnerId });
  const payload = buildLeadPayload(reg, null, 'TEST', partner);
  const result = await sendWebhook(webhook, payload, 'TEST', reg.registrationId, partnerId);
  const link = await IntegrationLink.findOne({ connectorId: webhookId, registrationId: reg.registrationId });
  return { ...result, registrationId: reg.registrationId, externalId: link?.externalId || '' };
}

module.exports = {
  buildLeadPayload,
  renderTemplate,
  renderUrl,
  triggerWebhooks,
  retryDelivery,
  resyncRange,
  performSend,
  sendTestPush,
  startRetryScheduler,
  processDueRetries
};

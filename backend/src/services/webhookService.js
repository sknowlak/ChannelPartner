const IntegrationWebhook = require('../models/IntegrationWebhook');
const WebhookDelivery = require('../models/WebhookDelivery');
const Registration = require('../models/Registration');
const Customer = require('../models/Customer');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { outboundUrlProblem } = require('../utils/outboundUrl');
const { redactHeaders, restoreRedacted } = require('../utils/secretHeaders');

const SEND_TIMEOUT_MS = 10000;
const MAX_RESPONSE_CHARS = 2000;
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
function buildLeadPayload(registration, customer, eventType, partner) {
  const reg = registration.toObject ? registration.toObject() : registration;
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
    customer: customer ? {
      name: customer.name,
      mobile: customer.mobile,
      countryCode: customer.mobileDialCode || '',
      nationalNumber: customer.mobileNationalNumber || '',
      email: customer.email,
      alternateMobile: customer.alternateMobile
    } : null,
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

function buildRequest(webhook, payload) {
  const headers = { ...(webhook.headers || {}) };
  let body;

  if (webhook.format === 'FORM') {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams();
    for (const [key, value] of flattenForForm(payload)) params.append(key, value);
    body = params.toString();
  } else if (webhook.format === 'CUSTOM' && webhook.bodyTemplate) {
    const contentTypeKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
    if (!contentTypeKey) headers['Content-Type'] = 'application/json';
    const contentType = contentTypeKey ? String(headers[contentTypeKey]) : 'application/json';
    body = renderTemplate(webhook.bodyTemplate, payload, escapeModeFor(contentType));
  } else {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }

  return { headers, body };
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

// Shared with notificationService for rule webhooks. The URL is re-checked
// right before every send (see utils/outboundUrl.js) and redirects are not
// followed: a 3xx is reported as a failure instead of being chased to
// wherever it points (e.g. an internal address).
async function performSend(url, method, headers, body) {
  const result = { status: 'FAILED', httpStatus: null, responseBody: '', errorMessage: '' };
  const problem = await outboundUrlProblem(url);
  if (problem) {
    result.errorMessage = `Blocked: ${problem}`;
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal, redirect: 'manual' });
    result.httpStatus = res.status;
    if (res.status >= 300 && res.status < 400) {
      result.errorMessage = `Server responded with a redirect (HTTP ${res.status}) - redirects are not followed; use the final URL`;
      res.body?.cancel().catch(() => {});
      return result;
    }
    result.responseBody = await readCapped(res, MAX_RESPONSE_CHARS);
    result.status = res.ok ? 'SUCCESS' : 'FAILED';
    if (!res.ok) result.errorMessage = `Server responded with HTTP ${res.status}`;
  } catch (err) {
    result.errorMessage = err.name === 'AbortError' ? `Request timed out after ${SEND_TIMEOUT_MS / 1000}s` : err.message;
  } finally {
    clearTimeout(timer);
  }
  return result;
}

// Sends one webhook and always writes a WebhookDelivery row - "I should get
// all updates failed, pass, or where its problem" - never throws, so a
// caller doing Promise.all() across several webhooks can't have one bad
// target blow up the others.
async function sendWebhook(webhook, payload, eventType, registrationId, partnerId) {
  const { headers, body } = buildRequest(webhook, payload);
  const outcome = await performSend(webhook.targetUrl, webhook.method || 'POST', headers, body);

  const deliveryId = await nextId('DLV');
  await WebhookDelivery.create({
    deliveryId,
    webhookId: webhook.webhookId,
    partnerId,
    registrationId,
    eventType,
    requestUrl: webhook.targetUrl,
    requestMethod: webhook.method || 'POST',
    // Credentials are not kept in the log every team member can read;
    // retryDelivery takes them from the live webhook config instead.
    requestHeaders: redactHeaders(headers),
    requestBody: body,
    ...outcome
  });

  return { deliveryId, ...outcome };
}

// Fire-and-forget from the caller's point of view (myLeadsController never
// awaits this) - a slow or dead external target must never slow down or
// fail the partner's own API response.
async function triggerWebhooks(partnerId, eventType, registration, customer) {
  const webhooks = await IntegrationWebhook.find({ partnerId, isEnabled: true, events: eventType });
  if (webhooks.length === 0) return;
  const partner = await Partner.findOne({ partnerId });
  const payload = buildLeadPayload(registration, customer, eventType, partner);
  await Promise.all(webhooks.map((wh) =>
    sendWebhook(wh, payload, eventType, registration.registrationId, partnerId).catch(() => {})
  ));
}

// Re-sends the EXACT request that was originally built (same URL/method/
// headers/body) rather than re-deriving it from the lead's current state -
// a retry should reproduce the original attempt, not silently send
// whatever the lead looks like now.
async function retryDelivery(partnerId, deliveryId) {
  const delivery = await WebhookDelivery.findOne({ deliveryId, partnerId });
  if (!delivery) return { error: 'Delivery not found' };

  const webhook = await IntegrationWebhook.findOne({ webhookId: delivery.webhookId, partnerId });
  const headers = restoreRedacted(delivery.requestHeaders, webhook?.headers);
  const outcome = await performSend(delivery.requestUrl, delivery.requestMethod, headers, delivery.requestBody);
  delivery.status = outcome.status;
  delivery.httpStatus = outcome.httpStatus;
  delivery.responseBody = outcome.responseBody;
  delivery.errorMessage = outcome.errorMessage;
  delivery.attempt += 1;
  await delivery.save();
  return { delivery };
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
    const customers = await Customer.find({ customerId: { $in: registrations.map((r) => r.customerId) } });
    const customerById = new Map(customers.map((c) => [c.customerId, c]));
    const partner = await Partner.findOne({ partnerId });

    const queue = [...registrations];
    const worker = async () => {
      while (queue.length) {
        const reg = queue.shift();
        const payload = buildLeadPayload(reg, customerById.get(reg.customerId), 'SYNC', partner);
        await sendWebhook(webhook, payload, 'SYNC', reg.registrationId, partnerId).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: RESYNC_CONCURRENCY }, worker));

    return { total: registrations.length, matching, truncated: matching > registrations.length, limit: RESYNC_MAX_LEADS };
  } finally {
    resyncsInProgress.delete(lockKey);
  }
}

module.exports = { buildLeadPayload, renderTemplate, triggerWebhooks, retryDelivery, resyncRange, performSend };

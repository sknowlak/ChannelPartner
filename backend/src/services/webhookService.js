const IntegrationWebhook = require('../models/IntegrationWebhook');
const WebhookDelivery = require('../models/WebhookDelivery');
const Registration = require('../models/Registration');
const Customer = require('../models/Customer');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');

const SEND_TIMEOUT_MS = 10000;

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

function renderTemplate(template, payload, { json = false } = {}) {
  let out = template;
  if (json) {
    out = out.replace(/"\{\{\s*([\w.]+)\s*\}\}"/g, (_, path) => JSON.stringify(lookupPath(payload, path)));
  }
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = lookupPath(payload, path) ?? '';
    return json ? JSON.stringify(value).slice(1, -1) : value;
  });
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
    body = renderTemplate(webhook.bodyTemplate, payload, { json: /json/i.test(contentType) });
  } else {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }

  return { headers, body };
}

async function performSend(url, method, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  const result = { status: 'FAILED', httpStatus: null, responseBody: '', errorMessage: '' };
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    result.httpStatus = res.status;
    result.responseBody = (await res.text()).slice(0, 2000);
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
    requestHeaders: headers,
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

  const outcome = await performSend(delivery.requestUrl, delivery.requestMethod, delivery.requestHeaders, delivery.requestBody);
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

  const registrations = await Registration.find(query);
  const customers = await Customer.find({ customerId: { $in: registrations.map((r) => r.customerId) } });
  const customerById = new Map(customers.map((c) => [c.customerId, c]));
  const partner = await Partner.findOne({ partnerId });

  for (const reg of registrations) {
    const payload = buildLeadPayload(reg, customerById.get(reg.customerId), 'SYNC', partner);
    await sendWebhook(webhook, payload, 'SYNC', reg.registrationId, partnerId);
  }

  return { total: registrations.length };
}

module.exports = { buildLeadPayload, renderTemplate, triggerWebhooks, retryDelivery, resyncRange };

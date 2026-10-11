const IntegrationWebhook = require('../models/IntegrationWebhook');
const WebhookDelivery = require('../models/WebhookDelivery');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { generateApiKey } = require('../utils/apiKey');
const { retryDelivery, resyncRange, sendTestPush } = require('../services/webhookService');
const { sanitizeAuth, authProblem, maskAuth } = require('../services/httpAuthService');
const { urlShapeProblem } = require('../utils/outboundUrl');
const { logEvent } = require('../services/auditService');
const { outboundUrlProblem } = require('../utils/outboundUrl');
const { maskHeaders, headersProblem } = require('../utils/secretHeaders');
const { PERMISSIONS } = require('../config/permissions');

const VALID_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];
const VALID_UPDATE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const VALID_FORMATS = ['JSON', 'FORM', 'CUSTOM'];
const VALID_EVENTS = ['LEAD_CREATED', 'LEAD_UPDATED', 'STAGE_UPDATED', 'BOOKING_COMPLETED'];
// Header values often hold a client CRM's credentials. Only someone who can
// edit webhooks (MANAGE_SETTINGS) sees them in full - they need the real
// values to edit the form; everyone else sees them masked.
function canSeeSecrets(req) {
  return (req.permissions || []).includes(PERMISSIONS.MANAGE_SETTINGS);
}

// Auth secrets (passwords, tokens, client secrets) are never returned - not
// even to MANAGE_SETTINGS holders; the form sends the mask back to mean
// "unchanged" (httpAuthService.sanitizeAuth).
function toClient(webhook, req) {
  const obj = webhook.toObject ? webhook.toObject() : { ...webhook };
  obj.auth = maskAuth(obj.auth);
  if (!canSeeSecrets(req)) obj.headers = maskHeaders(obj.headers);
  return obj;
}

// A URL with {{placeholders}} can't be resolved until send time; its shape
// (scheme, no credentials) is checked now, the address on every send.
async function targetUrlProblem(url) {
  if (/\{\{/.test(String(url))) return urlShapeProblem(String(url).replace(/\{\{[^}]*\}\}/g, 'x'));
  return outboundUrlProblem(url);
}

// The section 51 options shared by create and update. Returns
// { values, error }; `existing` supplies stored secrets the form left masked.
async function readAdvancedOptions(body, existing) {
  const values = {};
  if (body.auth !== undefined) {
    values.auth = sanitizeAuth(body.auth, existing?.auth);
    const problem = await authProblem(values.auth);
    if (problem) return { error: problem, fieldKey: 'auth' };
  }
  if (body.mode !== undefined) {
    if (!['SAME', 'CREATE_UPDATE'].includes(body.mode)) return { error: 'mode must be SAME or CREATE_UPDATE' };
    values.mode = body.mode;
  }
  if (body.responseIdPath !== undefined) values.responseIdPath = String(body.responseIdPath || '').trim().slice(0, 200);
  if (body.updateUrl !== undefined) {
    values.updateUrl = String(body.updateUrl || '').trim();
    if (values.updateUrl) {
      const problem = await targetUrlProblem(values.updateUrl);
      if (problem) return { error: `Update URL: ${problem}`, fieldKey: 'updateUrl' };
    }
  }
  if (body.updateMethod !== undefined) {
    if (!VALID_UPDATE_METHODS.includes(body.updateMethod)) return { error: `updateMethod must be one of ${VALID_UPDATE_METHODS.join(', ')}` };
    values.updateMethod = body.updateMethod;
  }
  if (body.updateBodyTemplate !== undefined) values.updateBodyTemplate = String(body.updateBodyTemplate || '').slice(0, 50000);
  if (body.maxRetries !== undefined) {
    const n = Number(body.maxRetries);
    if (!Number.isInteger(n) || n < 0 || n > 5) return { error: 'maxRetries must be 0-5' };
    values.maxRetries = n;
  }

  const mode = values.mode ?? existing?.mode;
  const updateUrl = values.updateUrl ?? existing?.updateUrl;
  const responseIdPath = values.responseIdPath ?? existing?.responseIdPath;
  if (mode === 'CREATE_UPDATE' && (!updateUrl || !responseIdPath)) {
    return { error: 'Create + update mode needs the update URL and where the record ID is in the create response', fieldKey: 'updateUrl' };
  }
  return { values };
}

// GET /api/channel-partner/my/integrations/api-key
async function getApiKey(req, res, next) {
  try {
    const partner = await Partner.findOne({ partnerId: req.partnerId });
    // Self-heals partners who registered before this module existed
    // (section 43), the same way ensureBaseFields does for lead/user fields.
    if (!partner.apiKey) {
      partner.apiKey = generateApiKey();
      await partner.save();
    }
    return res.json({
      apiKey: partner.apiKey,
      inboundLeadUrl: `${req.protocol}://${req.get('host')}/api/channel-partner/integrations/leads`,
      inboundProgressUrl: `${req.protocol}://${req.get('host')}/api/channel-partner/integrations/leads/:registrationId/progress`
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/integrations/api-key/regenerate  (requires MANAGE_SETTINGS)
async function regenerateApiKey(req, res, next) {
  try {
    const partner = await Partner.findOne({ partnerId: req.partnerId });
    partner.apiKey = generateApiKey();
    await partner.save();

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'INTEGRATION_API_KEY_REGENERATED',
      actor: req.actorLabel,
      description: 'Integration API key regenerated'
    });

    return res.json({ apiKey: partner.apiKey });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/integrations/webhooks
async function listWebhooks(req, res, next) {
  try {
    const webhooks = await IntegrationWebhook.find({ partnerId: req.partnerId }).sort({ createdAt: -1 });
    const visible = webhooks.map((w) => toClient(w, req));
    return res.json({ count: visible.length, webhooks: visible });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/integrations/webhooks  (requires MANAGE_SETTINGS)
async function createWebhook(req, res, next) {
  try {
    const { name, targetUrl, method, format, headers, bodyTemplate, events } = req.body;
    if (!name || !targetUrl) return res.status(400).json({ reason: 'name and targetUrl are required' });
    const urlProblem = await targetUrlProblem(targetUrl);
    if (urlProblem) return res.status(400).json({ reason: urlProblem, fieldKey: 'targetUrl' });
    const badHeaders = headersProblem(headers);
    if (badHeaders) return res.status(400).json({ reason: badHeaders, fieldKey: 'headers' });
    if (method && !VALID_METHODS.includes(method)) return res.status(400).json({ reason: `method must be one of ${VALID_METHODS.join(', ')}` });
    if (format && !VALID_FORMATS.includes(format)) return res.status(400).json({ reason: `format must be one of ${VALID_FORMATS.join(', ')}` });
    if (events && events.some((e) => !VALID_EVENTS.includes(e))) return res.status(400).json({ reason: `events must be a subset of ${VALID_EVENTS.join(', ')}` });
    const advanced = await readAdvancedOptions(req.body, null);
    if (advanced.error) return res.status(400).json({ reason: advanced.error, fieldKey: advanced.fieldKey });

    const webhookId = await nextId('WHK');
    const webhook = await IntegrationWebhook.create({
      webhookId,
      partnerId: req.partnerId,
      name,
      targetUrl,
      method: method || 'POST',
      format: format || 'JSON',
      headers: headers || {},
      bodyTemplate: bodyTemplate || '',
      events: events && events.length ? events : ['LEAD_CREATED'],
      isEnabled: true,
      createdVia: req.createdVia || 'SETTINGS',
      ...advanced.values
    });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'INTEGRATION_WEBHOOK_CREATED',
      actor: req.actorLabel,
      newValue: { webhookId, name, targetUrl },
      description: `Created integration webhook "${name}"`
    });

    return res.status(201).json(toClient(webhook, req));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/channel-partner/my/integrations/webhooks/:webhookId  (requires MANAGE_SETTINGS)
async function updateWebhook(req, res, next) {
  try {
    const webhook = await IntegrationWebhook.findOne({ webhookId: req.params.webhookId, partnerId: req.partnerId });
    if (!webhook) return res.status(404).json({ reason: 'Webhook not found' });

    const { name, targetUrl, method, format, headers, bodyTemplate, events, isEnabled } = req.body;
    if (targetUrl !== undefined) {
      const urlProblem = await targetUrlProblem(targetUrl);
      if (urlProblem) return res.status(400).json({ reason: urlProblem, fieldKey: 'targetUrl' });
    }
    const badHeaders = headersProblem(headers);
    if (badHeaders) return res.status(400).json({ reason: badHeaders, fieldKey: 'headers' });
    if (method && !VALID_METHODS.includes(method)) return res.status(400).json({ reason: `method must be one of ${VALID_METHODS.join(', ')}` });
    if (format && !VALID_FORMATS.includes(format)) return res.status(400).json({ reason: `format must be one of ${VALID_FORMATS.join(', ')}` });
    if (events && events.some((e) => !VALID_EVENTS.includes(e))) return res.status(400).json({ reason: `events must be a subset of ${VALID_EVENTS.join(', ')}` });
    const advanced = await readAdvancedOptions(req.body, webhook);
    if (advanced.error) return res.status(400).json({ reason: advanced.error, fieldKey: advanced.fieldKey });
    Object.assign(webhook, advanced.values);

    if (name !== undefined) webhook.name = name;
    if (targetUrl !== undefined) webhook.targetUrl = targetUrl;
    if (method !== undefined) webhook.method = method;
    if (format !== undefined) webhook.format = format;
    if (headers !== undefined) webhook.headers = headers;
    if (bodyTemplate !== undefined) webhook.bodyTemplate = bodyTemplate;
    if (events !== undefined) webhook.events = events;
    if (isEnabled !== undefined) webhook.isEnabled = isEnabled;
    await webhook.save();

    return res.json(toClient(webhook, req));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/channel-partner/my/integrations/webhooks/:webhookId  (requires MANAGE_SETTINGS)
async function deleteWebhook(req, res, next) {
  try {
    const webhook = await IntegrationWebhook.findOneAndDelete({ webhookId: req.params.webhookId, partnerId: req.partnerId });
    if (!webhook) return res.status(404).json({ reason: 'Webhook not found' });
    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/integrations/deliveries?webhookId=&status=&from=&to=
async function listDeliveries(req, res, next) {
  try {
    const { webhookId, status, from, to } = req.query;
    const filter = { partnerId: req.partnerId };
    if (webhookId) filter.webhookId = String(webhookId);
    if (status) filter.status = String(status);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const deliveries = await WebhookDelivery.find(filter).sort({ createdAt: -1 }).limit(500);
    const summary = {
      total: deliveries.length,
      success: deliveries.filter((d) => d.status === 'SUCCESS').length,
      failed: deliveries.filter((d) => d.status === 'FAILED').length
    };
    // New rows are stored with credentials redacted already; rows logged
    // before that change still hold them, so mask on the way out as well.
    const visible = deliveries.map((d) => ({ ...d.toObject(), requestHeaders: maskHeaders(d.requestHeaders) }));
    return res.json({ ...summary, deliveries: visible });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/integrations/deliveries/:deliveryId/retry  (requires MANAGE_SETTINGS)
async function retryDeliveryHandler(req, res, next) {
  try {
    const { error, delivery } = await retryDelivery(req.partnerId, req.params.deliveryId);
    if (error) return res.status(404).json({ reason: error });
    return res.json(delivery);
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/integrations/webhooks/:webhookId/resync  (requires MANAGE_SETTINGS)
// Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } - either/both optional; omit both to resync everything.
async function resyncHandler(req, res, next) {
  try {
    const { from, to } = req.body;
    const result = await resyncRange(req.partnerId, req.params.webhookId, from, to);
    if (result.error) return res.status(result.status || 404).json({ reason: result.error });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'INTEGRATION_WEBHOOK_RESYNCED',
      actor: req.actorLabel,
      newValue: { webhookId: req.params.webhookId, from, to, total: result.total },
      description: `Resynced ${result.total} lead(s) to webhook ${req.params.webhookId}`
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/integrations/webhooks/:webhookId/test  (requires MANAGE_SETTINGS)
// Body: { registrationId? } - pushes that lead (or the newest one) now and
// returns the result, including the record ID read from the response.
async function testWebhook(req, res, next) {
  try {
    const result = await sendTestPush(req.partnerId, req.params.webhookId, req.body.registrationId);
    if (result.error) return res.status(400).json({ reason: result.error });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  testWebhook,
  getApiKey,
  regenerateApiKey,
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listDeliveries,
  retryDeliveryHandler,
  resyncHandler
};

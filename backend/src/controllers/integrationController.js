const IntegrationWebhook = require('../models/IntegrationWebhook');
const WebhookDelivery = require('../models/WebhookDelivery');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { generateApiKey } = require('../utils/apiKey');
const { retryDelivery, resyncRange } = require('../services/webhookService');
const { logEvent } = require('../services/auditService');

const VALID_METHODS = ['POST', 'PUT', 'PATCH'];
const VALID_FORMATS = ['JSON', 'FORM', 'CUSTOM'];
const VALID_EVENTS = ['LEAD_CREATED', 'LEAD_UPDATED', 'STAGE_UPDATED', 'BOOKING_COMPLETED'];

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
    return res.json({ count: webhooks.length, webhooks });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/integrations/webhooks  (requires MANAGE_SETTINGS)
async function createWebhook(req, res, next) {
  try {
    const { name, targetUrl, method, format, headers, bodyTemplate, events } = req.body;
    if (!name || !targetUrl) return res.status(400).json({ reason: 'name and targetUrl are required' });
    if (method && !VALID_METHODS.includes(method)) return res.status(400).json({ reason: `method must be one of ${VALID_METHODS.join(', ')}` });
    if (format && !VALID_FORMATS.includes(format)) return res.status(400).json({ reason: `format must be one of ${VALID_FORMATS.join(', ')}` });
    if (events && events.some((e) => !VALID_EVENTS.includes(e))) return res.status(400).json({ reason: `events must be a subset of ${VALID_EVENTS.join(', ')}` });

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
      isEnabled: true
    });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'INTEGRATION_WEBHOOK_CREATED',
      actor: req.actorLabel,
      newValue: { webhookId, name, targetUrl },
      description: `Created integration webhook "${name}"`
    });

    return res.status(201).json(webhook);
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
    if (method && !VALID_METHODS.includes(method)) return res.status(400).json({ reason: `method must be one of ${VALID_METHODS.join(', ')}` });
    if (format && !VALID_FORMATS.includes(format)) return res.status(400).json({ reason: `format must be one of ${VALID_FORMATS.join(', ')}` });
    if (events && events.some((e) => !VALID_EVENTS.includes(e))) return res.status(400).json({ reason: `events must be a subset of ${VALID_EVENTS.join(', ')}` });

    if (name !== undefined) webhook.name = name;
    if (targetUrl !== undefined) webhook.targetUrl = targetUrl;
    if (method !== undefined) webhook.method = method;
    if (format !== undefined) webhook.format = format;
    if (headers !== undefined) webhook.headers = headers;
    if (bodyTemplate !== undefined) webhook.bodyTemplate = bodyTemplate;
    if (events !== undefined) webhook.events = events;
    if (isEnabled !== undefined) webhook.isEnabled = isEnabled;
    await webhook.save();

    return res.json(webhook);
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
    if (webhookId) filter.webhookId = webhookId;
    if (status) filter.status = status;
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
    return res.json({ ...summary, deliveries });
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
    if (result.error) return res.status(404).json({ reason: result.error });

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

module.exports = {
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

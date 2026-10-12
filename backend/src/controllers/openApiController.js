const Registration = require('../models/Registration');
const { contactView } = require('../utils/contact');
const IntegrationWebhook = require('../models/IntegrationWebhook');
const { listStatuses } = require('../services/leadStatusService');
const { listFieldDefinitions } = require('../services/leadFieldDefinitionService');
const integrationController = require('./integrationController');

// The partner's own public API (section 51): anything holding the
// organisation's API key can read leads, statuses and fields, create and
// update leads, and subscribe to lead events (REST hooks) - full two-way
// communication with any other system. Auth: apiKeyAuth.

const MAX_PAGE_SIZE = 200;

function leadView(reg) {
  const r = reg.toObject ? reg.toObject() : reg;
  return {
    registrationId: r.registrationId,
    externalReferenceId: r.externalReferenceId || '',
    projectId: r.projectId || '',
    status: r.status,
    stage: r.currentStage,
    subStatus: r.subStatus || '',
    scheduledAt: r.scheduledAt || null,
    isBooked: !!r.isBooked,
    assignedTo: r.assignedTo || '',
    registeredAt: r.registeredAt,
    protectionExpiry: r.protectionExpiry,
    updatedAt: r.updatedAt,
    requirementType: r.requirementType || '',
    propertyType: r.propertyType || '',
    bhk: r.bhk || '',
    budgetMin: r.budgetMin ?? null,
    budgetMax: r.budgetMax ?? null,
    preferredLocation: r.preferredLocation || '',
    possessionTimeline: r.possessionTimeline || '',
    leadSource: r.leadSource || '',
    notes: r.notes || '',
    customFields: r.customFields || {},
    referralStatus: r.referralStatus,
    customer: (({ name, mobile, email, alternateMobile }) => ({ name, mobile, email, alternateMobile }))(contactView(r))
  };
}

// GET /integrations/leads?updatedSince=ISO&stage=&externalReferenceId=&page=1&limit=50
async function listLeads(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || 50));
    const filter = { partnerId: req.partnerId };
    if (req.query.updatedSince) {
      const since = new Date(String(req.query.updatedSince));
      if (Number.isNaN(since.getTime())) return res.status(400).json({ reason: 'updatedSince must be an ISO date/time' });
      filter.updatedAt = { $gte: since };
    }
    if (req.query.stage) filter.currentStage = String(req.query.stage);
    if (req.query.externalReferenceId) filter.externalReferenceId = String(req.query.externalReferenceId);

    const [total, regs] = await Promise.all([
      Registration.countDocuments(filter),
      Registration.find(filter).sort({ updatedAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit)
    ]);
    return res.json({
      page,
      limit,
      total,
      hasMore: page * limit < total,
      leads: regs.map((r) => leadView(r))
    });
  } catch (err) {
    next(err);
  }
}

// GET /integrations/leads/:registrationId
async function getLead(req, res, next) {
  try {
    const reg = await Registration.findOne({ partnerId: req.partnerId, registrationId: String(req.params.registrationId) });
    if (!reg) return res.status(404).json({ reason: 'Lead not found' });
    return res.json(leadView(reg));
  } catch (err) {
    next(err);
  }
}

// GET /integrations/lead-statuses - the partner's own pipeline.
async function listLeadStatusesPublic(req, res, next) {
  try {
    const statuses = await listStatuses(req.partnerId);
    return res.json({
      statuses: statuses.filter((s) => s.isActive).map((s) => ({
        name: s.name,
        isBooking: !!s.isBooking,
        requiresSchedule: !!s.requiresSchedule,
        subStatuses: (s.subStatuses || []).filter((x) => x.isActive !== false).map((x) => x.name)
      }))
    });
  } catch (err) {
    next(err);
  }
}

// GET /integrations/lead-fields - what can be sent and where it goes.
async function listLeadFieldsPublic(req, res, next) {
  try {
    const defs = await listFieldDefinitions(req.partnerId);
    return res.json({
      fields: defs.filter((d) => d.isEnabled).map((d) => ({
        fieldKey: d.fieldKey,
        label: d.label,
        dataType: d.dataType,
        options: d.options || [],
        required: !!d.isCore,
        // Where the value goes in a create request body.
        bodyPath: d.scope === 'customer' ? `customer.${d.fieldKey}` : d.fieldKey
      }))
    });
  } catch (err) {
    next(err);
  }
}

// --- Subscriptions (REST hooks) ------------------------------------------------
// Lets another system register its own callback URL for lead events with the
// API key alone (the pattern Zapier/Make use). Stored as ordinary webhooks
// (createdVia: 'API'), so they show up - and can be edited - in Settings.

async function listSubscriptions(req, res, next) {
  try {
    const hooks = await IntegrationWebhook.find({ partnerId: req.partnerId, createdVia: 'API' }).sort({ createdAt: -1 });
    return res.json({
      subscriptions: hooks.map((h) => ({ subscriptionId: h.webhookId, targetUrl: h.targetUrl, events: h.events, isEnabled: h.isEnabled, createdAt: h.createdAt }))
    });
  } catch (err) {
    next(err);
  }
}

function createSubscription(req, res, next) {
  const { targetUrl, events, name } = req.body;
  req.body = { name: name || `API subscription (${String(targetUrl || '').slice(0, 60)})`, targetUrl, events, method: 'POST', format: 'JSON' };
  req.createdVia = 'API';
  return integrationController.createWebhook(req, res, next);
}

async function deleteSubscription(req, res, next) {
  try {
    const hook = await IntegrationWebhook.findOneAndDelete({ partnerId: req.partnerId, webhookId: String(req.params.subscriptionId), createdVia: 'API' });
    if (!hook) return res.status(404).json({ reason: 'Subscription not found' });
    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// --- OpenAPI description ----------------------------------------------------------

function openApiSpec(req, res) {
  const base = `${req.protocol}://${req.get('host')}/api/channel-partner`;
  const key = { ApiKey: [] };
  const leadId = { name: 'registrationId', in: 'path', required: true, schema: { type: 'string' } };
  const json = (schema) => ({ content: { 'application/json': { schema } } });
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'Leadrat Channel Partner API',
      version: '1.0.0',
      description: 'Two-way lead integration. Authenticate with your API key (Settings > Integrations) in the X-Api-Key header, as "Authorization: Bearer <key>", or as ?api_key=<key> for tools that cannot set headers.'
    },
    servers: [{ url: base }],
    components: {
      securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } },
      schemas: {
        LeadCreate: {
          type: 'object',
          required: ['customer'],
          properties: {
            customer: {
              type: 'object',
              required: ['name', 'mobile'],
              properties: {
                name: { type: 'string' },
                mobile: { type: 'string', description: 'With country code (+91...), or a national number plus mobileCountry' },
                mobileCountry: { type: 'string', example: 'IN' },
                email: { type: 'string' },
                alternateMobile: { type: 'string' }
              }
            },
            projectId: { type: 'string' },
            externalReferenceId: { type: 'string', description: 'Your own ID - sending the same one twice never creates two leads' }
          },
          additionalProperties: { description: 'Any field from GET /integrations/lead-fields, by fieldKey' }
        },
        Progress: {
          type: 'object',
          required: ['stage'],
          properties: { stage: { type: 'string' }, subStatus: { type: 'string' }, notes: { type: 'string' }, scheduledAt: { type: 'string', format: 'date-time' } }
        },
        Subscription: {
          type: 'object',
          required: ['targetUrl'],
          properties: {
            targetUrl: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string', enum: ['LEAD_CREATED', 'LEAD_UPDATED', 'STAGE_UPDATED', 'BOOKING_COMPLETED'] } }
          }
        }
      }
    },
    security: [key],
    paths: {
      '/integrations/leads': {
        get: {
          summary: 'List leads (oldest change first, for incremental sync)',
          parameters: ['updatedSince', 'stage', 'externalReferenceId', 'page', 'limit'].map((name) => ({ name, in: 'query', schema: { type: 'string' } })),
          responses: { 200: { description: 'A page of leads' } }
        },
        post: { summary: 'Create a lead', requestBody: json({ $ref: '#/components/schemas/LeadCreate' }), responses: { 201: { description: 'Accepted' }, 409: { description: 'Duplicate - customer already protected' } } }
      },
      '/integrations/leads/{registrationId}': {
        get: { summary: 'Get one lead', parameters: [leadId], responses: { 200: { description: 'The lead' } } },
        patch: { summary: 'Update lead fields', parameters: [leadId], requestBody: json({ type: 'object' }), responses: { 200: { description: 'Updated' } } }
      },
      '/integrations/leads/{registrationId}/progress': {
        post: { summary: 'Change status / sub-status / schedule / note', parameters: [leadId], requestBody: json({ $ref: '#/components/schemas/Progress' }), responses: { 200: { description: 'Updated' } } }
      },
      '/integrations/leads/{registrationId}/booking': {
        post: { summary: 'Complete booking (hand over to builder)', parameters: [leadId], requestBody: json({ type: 'object', properties: { externalEventId: { type: 'string' } } }), responses: { 201: { description: 'Booked' } } }
      },
      '/integrations/lead-statuses': { get: { summary: 'Your status pipeline', responses: { 200: { description: 'Statuses' } } } },
      '/integrations/lead-fields': { get: { summary: 'Fields a lead can carry', responses: { 200: { description: 'Fields' } } } },
      '/integrations/subscriptions': {
        get: { summary: 'List event subscriptions made through the API', responses: { 200: { description: 'Subscriptions' } } },
        post: { summary: 'Subscribe a URL to lead events (REST hook)', requestBody: json({ $ref: '#/components/schemas/Subscription' }), responses: { 201: { description: 'Subscribed' } } }
      },
      '/integrations/subscriptions/{subscriptionId}': {
        delete: { summary: 'Unsubscribe', parameters: [{ name: 'subscriptionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } }
      }
    }
  });
}

module.exports = {
  listLeads,
  getLead,
  listLeadStatusesPublic,
  listLeadFieldsPublic,
  listSubscriptions,
  createSubscription,
  deleteSubscription,
  openApiSpec
};

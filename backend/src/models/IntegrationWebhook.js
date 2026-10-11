const mongoose = require('mongoose');

// A partner-configured outbound push target (sections 43 and 51) - "push the
// lead / progress update to a client". `format` decides how the payload is
// shaped on the wire: JSON (raw object), FORM (x-www-form-urlencoded,
// flattened), or CUSTOM (the partner's own `bodyTemplate` with {{field}}
// placeholders substituted).
//
// Section 51 makes it work with any API, not just "POST one URL":
// - `auth` - Basic / Bearer / API key (header or query) / OAuth2 client
//   credentials / HMAC signing (see httpAuthService).
// - `targetUrl` may contain {{placeholders}} (URL-encoded at send time).
// - `mode: CREATE_UPDATE` - the first push of a lead uses the create
//   request; once the target's own ID for it is known (read from the create
//   response via `responseIdPath`, stored in IntegrationLink), later events
//   use the update request instead - so updates change the same record on
//   the other side rather than creating duplicates. `{{external.id}}` holds
//   that ID for use in the update URL/body.
// - automatic retries with backoff for network errors, 429 and 5xx.
const integrationWebhookSchema = new mongoose.Schema(
  {
    webhookId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    targetUrl: { type: String, required: true },
    method: { type: String, enum: ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'], default: 'POST' },
    format: { type: String, enum: ['JSON', 'FORM', 'CUSTOM'], default: 'JSON' },
    headers: { type: mongoose.Schema.Types.Mixed, default: {} },
    bodyTemplate: { type: String, default: '' }, // only used when format === 'CUSTOM'
    events: {
      type: [String],
      enum: ['LEAD_CREATED', 'LEAD_UPDATED', 'STAGE_UPDATED', 'BOOKING_COMPLETED'],
      default: ['LEAD_CREATED']
    },
    isEnabled: { type: Boolean, default: true },

    auth: { type: mongoose.Schema.Types.Mixed, default: { type: 'NONE' } },
    mode: { type: String, enum: ['SAME', 'CREATE_UPDATE'], default: 'SAME' },
    // Where the target's own ID for the lead is in the create response, e.g.
    // `id`, `data.id`, `result.leadId`. Optional in SAME mode (still recorded
    // so {{external.id}} is available), needed for CREATE_UPDATE.
    responseIdPath: { type: String, default: '' },
    updateUrl: { type: String, default: '' },
    updateMethod: { type: String, enum: ['POST', 'PUT', 'PATCH', 'DELETE', ''], default: 'PUT' },
    updateBodyTemplate: { type: String, default: '' }, // blank = same body as create
    maxRetries: { type: Number, default: 3, min: 0, max: 5 },
    // Set when the webhook was created through the public subscriptions API
    // (a REST hook registered by another system, e.g. Zapier) - section 51.
    createdVia: { type: String, enum: ['SETTINGS', 'API'], default: 'SETTINGS' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('IntegrationWebhook', integrationWebhookSchema);

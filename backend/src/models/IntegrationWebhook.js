const mongoose = require('mongoose');

// A partner-configured outbound push target (section 43) - "push the lead
// / progress update to a client". `format` decides how the payload is
// shaped on the wire: JSON (raw object), FORM (x-www-form-urlencoded,
// flattened), or CUSTOM (the partner's own `bodyTemplate` with {{field}}
// placeholders substituted) - covers "make it customisable like cURL, JSON,
// Form and other formats" without needing a different code path per partner.
const integrationWebhookSchema = new mongoose.Schema(
  {
    webhookId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    targetUrl: { type: String, required: true },
    method: { type: String, enum: ['POST', 'PUT', 'PATCH'], default: 'POST' },
    format: { type: String, enum: ['JSON', 'FORM', 'CUSTOM'], default: 'JSON' },
    headers: { type: mongoose.Schema.Types.Mixed, default: {} },
    bodyTemplate: { type: String, default: '' }, // only used when format === 'CUSTOM'
    events: {
      type: [String],
      enum: ['LEAD_CREATED', 'LEAD_UPDATED', 'STAGE_UPDATED', 'BOOKING_COMPLETED'],
      default: ['LEAD_CREATED']
    },
    isEnabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('IntegrationWebhook', integrationWebhookSchema);

const mongoose = require('mongoose');

// One row per outbound push attempt (section 43) - "I should get all
// updates failed, pass, or where its problem". Stores the exact request
// that was sent so a failed delivery can be retried byte-for-byte without
// re-deriving it from the (possibly since-changed) lead.
const webhookDeliverySchema = new mongoose.Schema(
  {
    deliveryId: { type: String, required: true, unique: true },
    webhookId: { type: String, required: true, index: true },
    partnerId: { type: String, required: true, index: true },
    registrationId: { type: String, index: true },
    eventType: { type: String, required: true },
    requestUrl: String,
    requestMethod: String,
    requestHeaders: mongoose.Schema.Types.Mixed,
    requestBody: String,
    status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },
    httpStatus: Number,
    responseBody: String,
    errorMessage: String,
    attempt: { type: Number, default: 1 },
    // Which request this was in CREATE_UPDATE mode (section 51).
    operation: { type: String, enum: ['CREATE', 'UPDATE', 'SEND'], default: 'SEND' },
    // Automatic retry with backoff (section 51): set while another attempt is
    // scheduled, cleared when the retry scheduler claims it.
    nextRetryAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// The log holds full lead payloads (customer personal data) - kept 90
// days for troubleshooting and retries, then removed automatically.
webhookDeliverySchema.index({ nextRetryAt: 1 }, { sparse: true });
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookDelivery', webhookDeliverySchema);

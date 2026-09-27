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
    attempt: { type: Number, default: 1 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebhookDelivery', webhookDeliverySchema);

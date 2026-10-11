const mongoose = require('mongoose');

// One record received through a RECEIVE or PULL source (section 51) - the
// inbound counterpart of WebhookDelivery: what came in, and what happened to
// it (created / updated / duplicate / failed and why), so "my leads aren't
// arriving" can be answered from the Integrations page.
const inboundEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    sourceId: { type: String, required: true, index: true },
    externalId: { type: String, default: '' },
    outcome: { type: String, enum: ['CREATED', 'UPDATED', 'UNCHANGED', 'DUPLICATE', 'FAILED', 'REJECTED'], required: true },
    registrationId: { type: String, default: '' },
    message: { type: String, default: '' },
    record: { type: mongoose.Schema.Types.Mixed, default: null }, // the sender's record as received (size-capped)
    mapped: { type: mongoose.Schema.Types.Mixed, default: null } // what it became after mapping
  },
  { timestamps: true }
);

inboundEventSchema.index({ partnerId: 1, createdAt: -1 });
// Holds customer personal data - kept 90 days, like the outbound log.
inboundEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('InboundEvent', inboundEventSchema);

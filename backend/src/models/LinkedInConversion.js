const mongoose = require('mongoose');

// A conversion reported (or to be reported) to LinkedIn's Conversions API
// (section 59): lead X reached stage Y. `eventId` is unique, so each lead
// and stage is sent once however often the stage is re-entered; failed
// sends are retried by the connector scheduler.
const linkedInConversionSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true },
    registrationId: { type: String, required: true },
    leadId: { type: String, required: true },
    stage: { type: String, required: true },
    conversionUrn: { type: String, required: true },
    happenedAt: { type: Date, required: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    nextAttemptAt: { type: Date, default: () => new Date() },
    sentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

linkedInConversionSchema.index({ status: 1, nextAttemptAt: 1 });
linkedInConversionSchema.index({ partnerId: 1, createdAt: -1 });

module.exports = mongoose.model('LinkedInConversion', linkedInConversionSchema);

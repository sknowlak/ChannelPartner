const mongoose = require('mongoose');

const progressEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    registrationId: { type: String, required: true, index: true },
    stage: { type: String, required: true },
    eventType: { type: String, required: true },
    eventTime: { type: Date, default: Date.now },
    source: { type: String, default: 'PARTNER_CRM' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProgressEvent', progressEventSchema);

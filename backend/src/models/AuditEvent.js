const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    auditId: { type: String, required: true, unique: true },
    registrationId: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    actor: { type: String, required: true },
    source: { type: String, default: 'LEADRAT' },
    // "How" this happened (section 41) - Web app / Mobile app / Admin Portal
    // / External, or System for actions the platform took on its own
    // (duplicate checks, ownership transfer, ...) rather than a person.
    platform: { type: String, default: 'System' },
    timestamp: { type: Date, default: Date.now },
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    description: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditEvent', auditEventSchema);

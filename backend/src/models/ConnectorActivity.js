const mongoose = require('mongoose');

// Activity log of a connector (section 59): everything that happened
// between Leadrat and LinkedIn for a partner - connects, token refreshes,
// each sync with its counts, each lead and its outcome, ad-stat refreshes,
// conversions sent, webhook calls and errors. Kept for one year.

const TYPES = [
  'CONNECTED', 'DISCONNECTED', 'RECONNECT_NEEDED', 'TOKEN_REFRESHED', 'SETTINGS_UPDATED',
  'LEAD_SYNC', 'LEAD_CREATED', 'LEAD_DUPLICATE', 'LEAD_REJECTED', 'LEAD_FAILED',
  'STATS_SYNC', 'CONVERSION_RULE_CREATED', 'CONVERSION_SENT', 'CONVERSION_FAILED',
  'WEBHOOK_SUBSCRIBED', 'WEBHOOK_RECEIVED', 'ERROR'
];

const connectorActivitySchema = new mongoose.Schema(
  {
    activityId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true },
    connector: { type: String, required: true, default: 'LINKEDIN' },
    type: { type: String, enum: TYPES, required: true },
    level: { type: String, enum: ['INFO', 'WARNING', 'ERROR'], default: 'INFO' },
    message: { type: String, default: '' },
    actor: { type: String, default: '' },
    registrationId: { type: String, default: '' },
    externalId: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

connectorActivitySchema.index({ partnerId: 1, connector: 1, createdAt: -1 });
connectorActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('ConnectorActivity', connectorActivitySchema);
module.exports.ACTIVITY_TYPES = TYPES;

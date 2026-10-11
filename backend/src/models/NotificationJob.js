const mongoose = require('mongoose');

// One planned send of a NotificationRule for one lead (section 49). The
// scheduler picks up PENDING jobs whose fireAt has passed; a later status
// or schedule change on the lead CANCELs its still-pending jobs and plans
// new ones, so a reminder never fires for a time that's no longer true.
const notificationJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    ruleId: { type: String, required: true },
    registrationId: { type: String, required: true, index: true },
    fireAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED'], default: 'PENDING', index: true },
    // Snapshot of who/what triggered it - "the person who updated it" must
    // mean the person at trigger time, not whoever touches the lead later.
    context: {
      actorUserId: String,
      actorLabel: String,
      statusName: String,
      subStatusName: String,
      scheduledAt: Date
    },
    deliveries: [
      {
        _id: false,
        channel: String,
        recipient: String,
        status: { type: String, enum: ['SENT', 'FAILED', 'SKIPPED'] },
        detail: String
      }
    ],
    processedAt: Date,
    note: String
  },
  { timestamps: true }
);

// The scheduler's polling query: PENDING jobs due by now, oldest first.
notificationJobSchema.index({ status: 1, fireAt: 1 });
// Finished jobs are kept 90 days for the "Scheduled & Sent" log, then
// dropped. Keyed on processedAt, so PENDING jobs (which may be planned
// months ahead and have no processedAt yet) are never removed.
notificationJobSchema.index({ processedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('NotificationJob', notificationJobSchema);

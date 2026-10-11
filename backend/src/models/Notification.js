const mongoose = require('mongoose');

// An in-app notification in one user's bell inbox (section 49). `userId`
// is a TeamMember.memberId, or the partnerId for the account owner - the
// same id space as Registration.assignedTo.
const notificationSchema = new mongoose.Schema(
  {
    notificationId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true },
    userId: { type: String, required: true },
    ruleId: String,
    jobId: String,
    registrationId: String,
    title: { type: String, required: true },
    message: { type: String, default: '' },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

notificationSchema.index({ partnerId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

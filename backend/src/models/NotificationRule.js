const mongoose = require('mongoose');

// "When a lead reaches status X (/ sub-status Y), notify these people,
// this way, with this message, at this time" - section 49.
//
// timing.mode:
//   IMMEDIATE - as soon as the status is set
//   BEFORE    - `amount unit` before the lead's scheduled date & time
//   AT        - exactly at the scheduled date & time
//   AFTER     - `amount unit` after the scheduled date & time
// BEFORE/AT/AFTER only fire for leads that have a schedule (a status whose
// form asks for a date & time); they're re-planned whenever it changes.
const notificationRuleSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    isEnabled: { type: Boolean, default: true },
    trigger: {
      statusName: { type: String, default: '' }, // '' = any status
      subStatusName: { type: String, default: '' } // '' = any sub-status
    },
    timing: {
      mode: { type: String, enum: ['IMMEDIATE', 'BEFORE', 'AT', 'AFTER'], default: 'IMMEDIATE' },
      amount: { type: Number, default: 0, min: 0 },
      unit: { type: String, enum: ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS'], default: 'MINUTES' }
    },
    recipients: {
      assignedUser: { type: Boolean, default: true },
      owner: { type: Boolean, default: false },
      updatedBy: { type: Boolean, default: false },
      roleIds: { type: [String], default: [] },
      userIds: { type: [String], default: [] }
    },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      webhook: { type: Boolean, default: false }
    },
    webhook: {
      url: { type: String, default: '' },
      headers: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    content: {
      title: { type: String, default: '' },
      message: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationRule', notificationRuleSchema);

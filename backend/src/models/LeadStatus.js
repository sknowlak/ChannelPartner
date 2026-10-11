const mongoose = require('mongoose');

// Which lead fields the status-update form shows for a status/sub-status,
// and whether each must be filled in (section 49).
const statusFieldSchema = new mongoose.Schema(
  { fieldKey: { type: String, required: true }, isRequired: { type: Boolean, default: false } },
  { _id: false }
);

const subStatusSchema = new mongoose.Schema(
  {
    subStatusId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    requiresSchedule: { type: Boolean, default: false },
    scheduleLabel: { type: String, default: '' },
    fields: { type: [statusFieldSchema], default: [] }
  },
  { _id: false }
);

// A partner-defined lead status (section 49). Registration.currentStage /
// subStatus store the NAMES (not ids), so existing leads, history, webhooks
// and reports keep reading naturally; renaming cascades to registrations.
const leadStatusSchema = new mongoose.Schema(
  {
    statusId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: '#2f6fed' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isBooking: { type: Boolean, default: false },
    requiresSchedule: { type: Boolean, default: false },
    scheduleLabel: { type: String, default: '' },
    fields: { type: [statusFieldSchema], default: [] },
    subStatuses: { type: [subStatusSchema], default: [] }
  },
  { timestamps: true }
);

leadStatusSchema.index({ partnerId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('LeadStatus', leadStatusSchema);

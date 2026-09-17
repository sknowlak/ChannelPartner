const mongoose = require('mongoose');

// Singleton document (fixed _id) holding the configurable business rules
// from spec sections 7 and 10, editable via the admin portal instead of
// requiring a code/.env change.
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'GLOBAL_SETTINGS' },
    duplicateProtectionDays: { type: Number, required: true },
    duplicateMatchFields: { type: [String], required: true },
    fieldVisibility: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: 'SYSTEM' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);

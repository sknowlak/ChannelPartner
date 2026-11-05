const mongoose = require('mongoose');

// A project a lead can be referred to (section 52). Each project belongs to
// exactly one builder - that is what decides which builder sees a referral.
// `projectId` is the code partners pick (Registration.projectId stores it).
const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    builderId: { type: String, required: true, index: true },
    city: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    // Duplicate-protection window for this project in days (section 62);
    // null = the global Settings.duplicateProtectionDays.
    protectionDays: { type: Number, default: null, min: 1, max: 3650 },
    // Which identifiers count as "the same person" for this project
    // (section 62); unset = the global Settings.duplicateMatchFields.
    duplicateMatchFields: { type: [String], default: undefined }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);

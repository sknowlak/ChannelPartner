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
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);

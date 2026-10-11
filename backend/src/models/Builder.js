const mongoose = require('mongoose');

// A builder/developer organization (section 52). Created by an admin in the
// admin portal; its users see and act only on referrals for its own projects.
const builderSchema = new mongoose.Schema(
  {
    builderId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    createdBy: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('Builder', builderSchema);

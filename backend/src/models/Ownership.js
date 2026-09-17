const mongoose = require('mongoose');

const ownershipSchema = new mongoose.Schema(
  {
    ownershipId: { type: String, required: true, unique: true },
    registrationId: { type: String, required: true, index: true },
    workingOwner: { type: String, required: true },
    operationalOwner: { type: String, required: true },
    ownershipStatus: { type: String, enum: ['PARTNER_OWNED', 'BUILDER_OWNED'], default: 'PARTNER_OWNED' },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ownership', ownershipSchema);

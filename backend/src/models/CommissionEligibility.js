const mongoose = require('mongoose');

const commissionEligibilitySchema = new mongoose.Schema(
  {
    commissionId: { type: String, required: true, unique: true },
    registrationId: { type: String, required: true, index: true },
    partnerId: { type: String, required: true },
    bookingId: { type: String, required: true },
    projectId: { type: String, required: true },
    attributionStatus: { type: String, enum: ['ATTRIBUTED', 'DISPUTED'], default: 'ATTRIBUTED' },
    eligibilityStatus: { type: String, enum: ['ELIGIBLE', 'PENDING'], default: 'ELIGIBLE' },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CommissionEligibility', commissionEligibilitySchema);

const mongoose = require('mongoose');

const commissionEligibilitySchema = new mongoose.Schema(
  {
    commissionId: { type: String, required: true, unique: true },
    // One commission record per lead - see Booking.registrationId.
    registrationId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true },
    bookingId: { type: String, required: true },
    projectId: { type: String, default: '' },
    attributionStatus: { type: String, enum: ['ATTRIBUTED', 'DISPUTED'], default: 'ATTRIBUTED' },
    // CANCELLED: the booking was cancelled (section 62). The record stays, so
    // the history shows it existed; re-booking makes it ELIGIBLE again.
    eligibilityStatus: { type: String, enum: ['ELIGIBLE', 'PENDING', 'CANCELLED'], default: 'ELIGIBLE' },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CommissionEligibility', commissionEligibilitySchema);

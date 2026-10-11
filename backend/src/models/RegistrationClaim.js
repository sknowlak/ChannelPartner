const mongoose = require('mongoose');

// The atomic lock behind duplicate protection (section 7): one document per
// customer + project, held by whichever registration currently has
// protection. findDuplicate alone is check-then-insert, so two partners
// submitting the same customer at the same instant could both pass the check
// and both be ACCEPTED; the unique `key` makes only one of them win.
// See duplicateService.claimProtection.
const registrationClaimSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // `${customerId}|${projectId}`
    registrationId: { type: String, required: true },
    partnerId: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RegistrationClaim', registrationClaimSchema);

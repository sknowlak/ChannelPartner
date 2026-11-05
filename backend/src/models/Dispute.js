const mongoose = require('mongoose');

// An ownership dispute (section 62): a partner whose registration was
// rejected as a duplicate says the customer is really theirs. The raising
// partner never learns who holds the customer; the holder only sees that
// their lead is under review. A Leadrat admin decides:
//   UPHELD     - the current owner keeps the customer (nothing changes);
//   OVERTURNED - the holder's protection ends and the customer is
//                registered for the raising partner (resultRegistrationId).
// Either way the original registration, its attribution and its history stay.
const disputeSchema = new mongoose.Schema(
  {
    disputeId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true }, // who raised it
    raisedBy: { type: String, default: '' }, // display label of the person
    projectId: { type: String, default: '' },
    // The raising partner's own copy of the customer's details - what gets
    // registered for them if the dispute is overturned.
    customer: {
      name: { type: String, default: '' },
      mobile: { type: String, default: '' },
      email: { type: String, default: '' },
      alternateMobile: { type: String, default: '' }
    },
    reason: { type: String, required: true },
    // The registration holding protection when the dispute was raised.
    heldRegistrationId: { type: String, required: true, index: true },
    heldPartnerId: { type: String, required: true },
    status: { type: String, enum: ['OPEN', 'UPHELD', 'OVERTURNED', 'WITHDRAWN'], default: 'OPEN', index: true },
    resolution: {
      note: String,
      by: String,
      at: Date
    },
    resultRegistrationId: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispute', disputeSchema);

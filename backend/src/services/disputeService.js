const Dispute = require('../models/Dispute');
const Registration = require('../models/Registration');
const CommissionEligibility = require('../models/CommissionEligibility');
const { logEvent } = require('./auditService');

// Keeps the held lead's dispute flag (and its commission attribution) in
// step with its disputes (section 62): OPEN while any dispute on it is open,
// cleared once none is.
async function syncHeldDisputeState(heldRegistrationId) {
  const open = await Dispute.exists({ heldRegistrationId, status: 'OPEN' });
  await Registration.updateOne({ registrationId: heldRegistrationId }, { $set: { disputeStatus: open ? 'OPEN' : '' } });
  await CommissionEligibility.updateOne(
    { registrationId: heldRegistrationId },
    { $set: { attributionStatus: open ? 'DISPUTED' : 'ATTRIBUTED' } }
  );
}

// Written on the HELD lead, whose partner reads its timeline - so never the
// raising partner's name, ID or reason (section 52).
async function logHeldEvent(heldRegistrationId, eventType, description) {
  await logEvent({ registrationId: heldRegistrationId, eventType, actor: 'SYSTEM', description });
}

// What the raising partner sees: their own submission and the outcome,
// nothing about the holder.
function partnerDisputeView(d) {
  return {
    disputeId: d.disputeId,
    projectId: d.projectId,
    customerName: d.customer?.name || '',
    customerMobile: d.customer?.mobile || '',
    reason: d.reason,
    status: d.status,
    raisedBy: d.raisedBy,
    createdAt: d.createdAt,
    resolution: d.resolution?.at ? { note: d.resolution.note, at: d.resolution.at } : null,
    resultRegistrationId: d.resultRegistrationId || ''
  };
}

module.exports = { syncHeldDisputeState, logHeldEvent, partnerDisputeView };

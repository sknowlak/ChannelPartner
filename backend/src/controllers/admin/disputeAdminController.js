const Dispute = require('../../models/Dispute');
const Registration = require('../../models/Registration');
const Partner = require('../../models/Partner');
const { findDuplicate, releaseClaim } = require('../../services/duplicateService');
const { logEvent } = require('../../services/auditService');
const { syncHeldDisputeState, logHeldEvent } = require('../../services/disputeService');
const { invokeHandler } = require('../../utils/invokeHandler');
const { createMyRegistration } = require('../myLeadsController');

// Ownership disputes, admin side (section 62).

const STATUSES = ['OPEN', 'UPHELD', 'OVERTURNED', 'WITHDRAWN'];

async function partnerNames(ids) {
  const partners = await Partner.find({ partnerId: { $in: [...new Set(ids)] } }).select('partnerId name companyName');
  return new Map(partners.map((p) => [p.partnerId, p.companyName || p.name]));
}

function heldSummary(r) {
  if (!r) return null;
  return {
    registrationId: r.registrationId,
    partnerId: r.partnerId,
    registeredAt: r.registeredAt,
    protectionExpiry: r.protectionExpiry,
    isBooked: !!r.isBooked,
    currentStage: r.currentStage,
    referralStatus: r.referralStatus
  };
}

async function adminView(disputes) {
  const names = await partnerNames(disputes.flatMap((d) => [d.partnerId, d.heldPartnerId]));
  const held = await Registration.find({ registrationId: { $in: disputes.map((d) => d.heldRegistrationId) } });
  const heldById = new Map(held.map((r) => [r.registrationId, r]));
  return disputes.map((d) => ({
    ...d.toObject(),
    raisingPartnerName: names.get(d.partnerId) || d.partnerId,
    heldPartnerName: names.get(d.heldPartnerId) || d.heldPartnerId,
    held: heldSummary(heldById.get(d.heldRegistrationId))
  }));
}

// GET /api/admin/disputes?status=OPEN
async function listDisputes(req, res, next) {
  try {
    const filter = {};
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const disputes = await Dispute.find(filter).sort({ status: 1, createdAt: -1 }).limit(500);
    return res.json({ disputes: await adminView(disputes) });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/disputes/:disputeId
async function getDispute(req, res, next) {
  try {
    const dispute = await Dispute.findOne({ disputeId: String(req.params.disputeId) });
    if (!dispute) return res.status(404).json({ reason: 'Dispute not found' });
    const [view] = await adminView([dispute]);
    return res.json(view);
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/disputes/:disputeId/resolve  { outcome: UPHELD | OVERTURNED, note }
// UPHELD keeps the current owner. OVERTURNED ends the holder's protection and
// registers the customer for the raising partner through the normal create
// path (same validation, protection claim, audit, webhooks). A booked
// customer can't be overturned - cancel the booking first, so commission is
// never paid twice. Every outcome is audited with the admin and the note.
async function resolveDispute(req, res, next) {
  try {
    const outcome = String(req.body?.outcome || '');
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!['UPHELD', 'OVERTURNED'].includes(outcome)) return res.status(400).json({ reason: 'outcome must be UPHELD or OVERTURNED', fieldKey: 'outcome' });
    if (!note) return res.status(400).json({ reason: 'A note explaining the decision is required', fieldKey: 'note' });

    const dispute = await Dispute.findOne({ disputeId: String(req.params.disputeId) });
    if (!dispute) return res.status(404).json({ reason: 'Dispute not found' });
    if (dispute.status !== 'OPEN') return res.status(409).json({ reason: `This dispute is already ${dispute.status.toLowerCase()}` });
    const actor = `ADMIN:${req.admin.email}`;

    if (outcome === 'OVERTURNED') {
      const held = await Registration.findOne({ registrationId: dispute.heldRegistrationId });
      if (held?.isBooked) {
        return res.status(409).json({ reason: 'This customer is booked through the current owner - cancel the booking before overturning', code: 'HELD_BOOKED' });
      }
      const { customer, projectId } = dispute.toObject();
      // Someone other than the disputed holder may protect the customer too.
      const other = await findDuplicate({ ...customer, projectId, excludeRegistrationId: dispute.heldRegistrationId });
      if (other && other.partnerId !== dispute.partnerId) {
        return res.status(409).json({ reason: `Another registration (${other.registrationId}) also protects this customer - resolve that first`, code: 'OTHER_HOLDER' });
      }

      if (held && held.protectionExpiry > new Date()) {
        const previous = held.protectionExpiry;
        held.protectionExpiry = new Date();
        held.disputeStatus = '';
        await held.save();
        await logEvent({
          registrationId: held.registrationId,
          eventType: 'PROTECTION_ENDED_BY_DISPUTE',
          actor,
          previousValue: previous,
          newValue: held.protectionExpiry,
          description: `Protection ended: an ownership dispute was decided in favour of another partner. Note: ${note}`
        });
      }
      await releaseClaim(dispute.heldRegistrationId);

      const created = await invokeHandler(createMyRegistration, {
        partnerId: dispute.partnerId,
        actorLabel: `${actor} (dispute ${dispute.disputeId})`,
        body: { customer: { ...customer }, projectId, source: 'PARTNER_CRM' },
        // Only the core fields are known here (like an import, section 51).
        extra: { integrationImport: true }
      });
      if (created.status !== 201 || created.data?.status !== 'ACCEPTED') {
        return res.status(409).json({ reason: created.data?.reason || 'The customer could not be registered for the raising partner', code: 'REGISTER_FAILED' });
      }
      dispute.resultRegistrationId = created.data.registrationId;
      await logEvent({
        registrationId: created.data.registrationId,
        eventType: 'OWNERSHIP_DISPUTE_OVERTURNED',
        actor,
        newValue: { disputeId: dispute.disputeId },
        description: `Registered after your ownership dispute was decided in your favour. Note: ${note}`
      });
    } else {
      await logHeldEvent(dispute.heldRegistrationId, 'OWNERSHIP_DISPUTE_CLOSED', 'The ownership dispute on this customer was reviewed - your ownership is confirmed');
    }

    dispute.status = outcome;
    dispute.resolution = { note, by: actor, at: new Date() };
    await dispute.save();
    await syncHeldDisputeState(dispute.heldRegistrationId);

    const [view] = await adminView([dispute]);
    return res.json(view);
  } catch (err) {
    next(err);
  }
}

module.exports = { listDisputes, getDispute, resolveDispute };

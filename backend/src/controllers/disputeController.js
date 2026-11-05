const Dispute = require('../models/Dispute');
const { nextId } = require('../utils/idGenerator');
const { findDuplicate } = require('../services/duplicateService');
const { validateMobileField } = require('../utils/phone');
const { syncHeldDisputeState, logHeldEvent, partnerDisputeView } = require('../services/disputeService');

// Ownership disputes, partner side (section 62).

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// POST /api/channel-partner/my/disputes
// { customer: { name, mobile, mobileCountry?, email?, alternateMobile? }, projectId, reason }
// The partner re-enters the customer they were refused (the rejection never
// named the holder); the server finds the protecting registration itself, so
// a dispute can only ever target a lead that really blocks this customer.
async function raiseDispute(req, res, next) {
  try {
    const customer = req.body?.customer && typeof req.body.customer === 'object' ? req.body.customer : {};
    const projectId = str(req.body?.projectId, 60);
    const reason = str(req.body?.reason, 1000);

    if (!str(customer.name, 120)) return res.status(400).json({ reason: 'customer.name is required', fieldKey: 'name' });
    const mobileCheck = validateMobileField(customer.mobile, customer.mobileCountry);
    if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
    let alternateMobile = '';
    if (customer.alternateMobile) {
      const altCheck = validateMobileField(customer.alternateMobile, customer.alternateMobileCountry);
      if (!altCheck.valid) return res.status(400).json({ reason: altCheck.reason, fieldKey: 'alternateMobile', code: altCheck.code });
      alternateMobile = altCheck.e164;
    }
    if (reason.length < 10) {
      return res.status(400).json({ reason: 'Explain why this customer is yours (at least 10 characters)', fieldKey: 'reason' });
    }
    const email = str(customer.email, 200);

    const held = await findDuplicate({ mobile: mobileCheck.e164, email, alternateMobile, projectId });
    if (!held) {
      return res.status(409).json({ reason: 'Nobody holds protection on this customer for this project - you can register the lead now', code: 'NOT_PROTECTED' });
    }
    if (held.partnerId === req.partnerId) {
      return res.status(409).json({ reason: 'This customer is already one of your leads', code: 'ALREADY_YOURS' });
    }
    if (await Dispute.exists({ partnerId: req.partnerId, heldRegistrationId: held.registrationId, status: 'OPEN' })) {
      return res.status(409).json({ reason: 'You already have an open dispute for this customer', code: 'ALREADY_OPEN' });
    }

    const dispute = await Dispute.create({
      disputeId: await nextId('DSP'),
      partnerId: req.partnerId,
      raisedBy: req.actorLabel,
      projectId,
      customer: { name: str(customer.name, 120), mobile: mobileCheck.e164, email, alternateMobile },
      reason,
      heldRegistrationId: held.registrationId,
      heldPartnerId: held.partnerId
    });
    await syncHeldDisputeState(held.registrationId);
    await logHeldEvent(held.registrationId, 'OWNERSHIP_DISPUTE_RAISED', 'Another partner disputed ownership of this customer - a Leadrat admin will review it');

    return res.status(201).json(partnerDisputeView(dispute));
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/disputes - the disputes this partner raised.
async function listMyDisputes(req, res, next) {
  try {
    const disputes = await Dispute.find({ partnerId: req.partnerId }).sort({ createdAt: -1 }).limit(500);
    return res.json({ disputes: disputes.map(partnerDisputeView) });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/disputes/:disputeId/withdraw
async function withdrawDispute(req, res, next) {
  try {
    const dispute = await Dispute.findOneAndUpdate(
      { disputeId: String(req.params.disputeId), partnerId: req.partnerId, status: 'OPEN' },
      { $set: { status: 'WITHDRAWN', resolution: { note: 'Withdrawn by the partner', by: req.actorLabel, at: new Date() } } },
      { new: true }
    );
    if (!dispute) return res.status(404).json({ reason: 'Open dispute not found' });
    await syncHeldDisputeState(dispute.heldRegistrationId);
    await logHeldEvent(dispute.heldRegistrationId, 'OWNERSHIP_DISPUTE_CLOSED', 'The ownership dispute on this customer was withdrawn - your ownership is unchanged');
    return res.json(partnerDisputeView(dispute));
  } catch (err) {
    next(err);
  }
}

module.exports = { raiseDispute, listMyDisputes, withdrawDispute };

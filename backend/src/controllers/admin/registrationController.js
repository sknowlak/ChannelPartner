const Registration = require('../../models/Registration');
const Customer = require('../../models/Customer');
const Booking = require('../../models/Booking');
const CommissionEligibility = require('../../models/CommissionEligibility');
const { getOwnership } = require('../../services/ownershipService');
const { getTimeline, logEvent } = require('../../services/auditService');

// GET /api/admin/registrations?partnerId=&projectId=&status=&isBooked=
async function listRegistrations(req, res, next) {
  try {
    const { partnerId, projectId, status, isBooked } = req.query;
    const filter = {};
    if (partnerId) filter.partnerId = partnerId;
    if (projectId) filter.projectId = projectId;
    if (status) filter.status = status;
    if (isBooked !== undefined) filter.isBooked = isBooked === 'true';

    const registrations = await Registration.find(filter).sort({ registeredAt: -1 });
    return res.json({ count: registrations.length, registrations });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/registrations/:registrationId
// Unlike the partner/builder views, admin sees everything - no field-level
// restriction - since this is the operator control surface.
async function getRegistration(req, res, next) {
  try {
    const { registrationId } = req.params;
    const registration = await Registration.findOne({ registrationId });
    if (!registration) return res.status(404).json({ reason: 'Registration not found' });

    const [customer, ownership, booking, commission] = await Promise.all([
      Customer.findOne({ customerId: registration.customerId }),
      getOwnership(registrationId),
      Booking.findOne({ registrationId }),
      CommissionEligibility.findOne({ registrationId })
    ]);

    return res.json({ registration, customer, ownership, booking, commission });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/registrations/:registrationId/audit
async function getRegistrationAudit(req, res, next) {
  try {
    const events = await getTimeline(req.params.registrationId);
    return res.json({ events });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/registrations/:registrationId/override
// Explicit, audited dispute-resolution actions. Never silent - every
// override is written to the audit trail with the acting admin and reason
// (spec section 21: "the system must never silently overwrite ownership").
async function overrideRegistration(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { action, reason, newPartnerId } = req.body;

    if (!reason) return res.status(400).json({ reason: 'A reason is required for any admin override' });

    const registration = await Registration.findOne({ registrationId });
    if (!registration) return res.status(404).json({ reason: 'Registration not found' });

    if (action === 'RELEASE_PROTECTION') {
      const previous = registration.protectionExpiry;
      registration.protectionExpiry = new Date();
      await registration.save();
      await logEvent({
        registrationId,
        eventType: 'ADMIN_PROTECTION_RELEASED',
        actor: `ADMIN:${req.admin.email}`,
        previousValue: previous,
        newValue: registration.protectionExpiry,
        description: `Admin released duplicate protection early. Reason: ${reason}`
      });
      return res.json({ registrationId, protectionExpiry: registration.protectionExpiry });
    }

    if (action === 'REASSIGN_PARTNER') {
      if (!newPartnerId) return res.status(400).json({ reason: 'newPartnerId is required for REASSIGN_PARTNER' });
      const previous = registration.partnerId;
      registration.partnerId = newPartnerId;
      await registration.save();
      await logEvent({
        registrationId,
        eventType: 'ADMIN_PARTNER_REASSIGNED',
        actor: `ADMIN:${req.admin.email}`,
        previousValue: previous,
        newValue: newPartnerId,
        description: `Admin reassigned registration from ${previous} to ${newPartnerId}. Reason: ${reason}`
      });
      return res.json({ registrationId, partnerId: registration.partnerId });
    }

    return res.status(400).json({ reason: 'Unsupported action. Use RELEASE_PROTECTION or REASSIGN_PARTNER' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRegistrations, getRegistration, getRegistrationAudit, overrideRegistration };

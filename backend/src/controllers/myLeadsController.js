const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const ProgressEvent = require('../models/ProgressEvent');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const { nextId } = require('../utils/idGenerator');
const { findDuplicate } = require('../services/duplicateService');
const { createInitialOwnership, getOwnership, transferOperationalOwnershipToBuilder } = require('../services/ownershipService');
const { logEvent, getTimeline } = require('../services/auditService');
const { withIdempotency } = require('../services/idempotencyService');
const { getSettings } = require('../services/settingsService');

// The authenticated, ownership-enforced counterpart to registrationController
// / bookingController - every operation here is scoped to req.partnerId (set
// by partnerAuth), never to a partnerId supplied by the caller. This is what
// closes the "one partner must never see another partner's registrations"
// safeguard (spec section 21) for the self-service portal.

async function assertOwnedRegistration(registrationId, partnerId) {
  const registration = await Registration.findOne({ registrationId });
  if (!registration) return { error: { status: 404, reason: 'Registration not found' } };
  if (registration.partnerId !== partnerId) return { error: { status: 403, reason: 'This registration does not belong to your account' } };
  return { registration };
}

// GET /api/channel-partner/my/registrations
// Includes the lead's name/mobile inline (not just IDs) - the list is the
// primary "who are my leads" view, so it needs to actually show who they are.
async function listMyRegistrations(req, res, next) {
  try {
    const registrations = await Registration.find({ partnerId: req.partnerId }).sort({ registeredAt: -1 });
    const customers = await Customer.find({ customerId: { $in: registrations.map((r) => r.customerId) } });
    const customerById = new Map(customers.map((c) => [c.customerId, c]));

    const enriched = registrations.map((r) => {
      const customer = customerById.get(r.customerId);
      return {
        ...r.toObject(),
        customerName: customer?.name || '',
        customerMobile: customer?.mobile || ''
      };
    });

    return res.json({ count: enriched.length, registrations: enriched });
  } catch (err) {
    next(err);
  }
}

// Real-estate lead requirement fields (section 33) - all optional, carried
// straight through from the lead form onto the Registration document.
const REQUIREMENT_FIELDS = [
  'requirementType', 'propertyType', 'bhk', 'budgetMin', 'budgetMax',
  'preferredLocation', 'possessionTimeline', 'leadSource', 'notes'
];

// POST /api/channel-partner/my/registrations
async function createMyRegistration(req, res, next) {
  try {
    const { customer, source, externalReferenceId } = req.body;
    const projectId = req.body.projectId || '';
    const partnerId = req.partnerId;

    // Only the lead's name and mobile number are mandatory (section 33) -
    // project and every requirement detail below are optional.
    if (!customer || !customer.mobile || !customer.name) {
      return res.status(400).json({ status: 'ERROR', reason: 'customer.name and customer.mobile are required' });
    }

    const { result } = await withIdempotency(externalReferenceId, 'createMyRegistration', async () => {
      const duplicate = await findDuplicate({ mobile: customer.mobile, email: customer.email, projectId });

      if (duplicate) {
        await logEvent({
          registrationId: duplicate.registrationId,
          eventType: 'REGISTRATION_ATTEMPT_REJECTED',
          actor: req.actorLabel,
          source: source || 'PARTNER_CRM',
          description: `Duplicate registration attempt by ${partnerId} rejected`
        });

        return {
          status: 'REJECTED',
          reasonCode: 'DUPLICATE_PROTECTED',
          reason: 'Customer is already registered by another partner.',
          protectedUntil: duplicate.protectionExpiry
        };
      }

      let customerDoc = await Customer.findOne({ mobile: customer.mobile });
      if (!customerDoc) {
        const customerId = await nextId('CUST');
        customerDoc = await Customer.create({
          customerId,
          name: customer.name,
          mobile: customer.mobile,
          email: customer.email,
          alternateMobile: customer.alternateMobile
        });
      } else if (customer.alternateMobile && !customerDoc.alternateMobile) {
        customerDoc.alternateMobile = customer.alternateMobile;
        await customerDoc.save();
      }

      const { duplicateProtectionDays } = await getSettings();
      const registrationId = await nextId('REG');
      const registeredAt = new Date();
      const protectionExpiry = new Date(registeredAt.getTime() + duplicateProtectionDays * 24 * 60 * 60 * 1000);

      const requirementDetails = {};
      for (const field of REQUIREMENT_FIELDS) {
        if (req.body[field] !== undefined && req.body[field] !== '') requirementDetails[field] = req.body[field];
      }

      await Registration.create({
        registrationId,
        customerId: customerDoc.customerId,
        partnerId,
        projectId,
        status: 'ACCEPTED',
        currentStage: 'Registered',
        registeredAt,
        protectionStart: registeredAt,
        protectionExpiry,
        externalReferenceId,
        source: source || 'PARTNER_CRM',
        ...requirementDetails
      });

      await createInitialOwnership(registrationId, partnerId);

      const eventId = await nextId('PROG');
      await ProgressEvent.create({
        eventId,
        registrationId,
        stage: 'Registered',
        eventType: 'REGISTRATION_CREATED',
        source: source || 'PARTNER_CRM'
      });

      await logEvent({ registrationId, eventType: 'REGISTRATION_RECEIVED', actor: req.actorLabel, description: 'Partner registration received' });
      await logEvent({ registrationId, eventType: 'DUPLICATE_CHECK_COMPLETED', actor: 'SYSTEM', description: 'Duplicate check completed - no active duplicate found' });
      await logEvent({ registrationId, eventType: 'REGISTRATION_ACCEPTED', actor: 'SYSTEM', description: 'Registration accepted' });
      await logEvent({
        registrationId,
        eventType: 'PROTECTION_GRANTED',
        actor: 'SYSTEM',
        newValue: { protectionExpiry },
        description: `${duplicateProtectionDays}-day protection granted`
      });

      return {
        status: 'ACCEPTED',
        registrationId,
        owner: partnerId,
        protectionDays: duplicateProtectionDays,
        expiryDate: protectionExpiry
      };
    });

    const httpStatus = result.status === 'REJECTED' ? 409 : 201;
    return res.status(httpStatus).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/registrations/:registrationId
async function getMyRegistration(req, res, next) {
  try {
    const { registration, error } = await assertOwnedRegistration(req.params.registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const [customer, ownership, booking, commission] = await Promise.all([
      Customer.findOne({ customerId: registration.customerId }),
      getOwnership(registration.registrationId),
      Booking.findOne({ registrationId: registration.registrationId }),
      CommissionEligibility.findOne({ registrationId: registration.registrationId })
    ]);

    return res.json({ registration, customer, ownership, booking, commission });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/registrations/:registrationId/progress
async function updateMyProgress(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { registration, error } = await assertOwnedRegistration(registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const { stage, eventType, source } = req.body;
    const previousStage = registration.currentStage;
    registration.currentStage = stage;
    await registration.save();

    const eventId = await nextId('PROG');
    await ProgressEvent.create({ eventId, registrationId, stage, eventType: eventType || 'STAGE_UPDATED', source: source || 'PARTNER_CRM' });

    await logEvent({
      registrationId,
      eventType: 'STAGE_UPDATED',
      actor: req.actorLabel,
      source: source || 'PARTNER_CRM',
      previousValue: previousStage,
      newValue: stage,
      description: `Partner updated stage to ${stage}`
    });

    return res.json({ registrationId, currentStage: stage });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/registrations/:registrationId/booking
async function createMyBooking(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { registration, error } = await assertOwnedRegistration(registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const { externalEventId } = req.body;

    const { replayed, result } = await withIdempotency(externalEventId, 'createMyBooking', async () => {
      const bookingId = await nextId('BOOK');
      await Booking.create({ bookingId, registrationId, projectId: registration.projectId, externalEventId });

      await logEvent({ registrationId, eventType: 'BOOKING_COMPLETED', actor: req.actorLabel, description: 'Booking completed' });

      await transferOperationalOwnershipToBuilder(registrationId);
      registration.isBooked = true;
      registration.currentStage = 'Booking';
      await registration.save();

      await logEvent({
        registrationId,
        eventType: 'OPERATIONAL_OWNERSHIP_TRANSFERRED',
        actor: 'SYSTEM',
        previousValue: registration.partnerId,
        newValue: 'BUILDER',
        description: 'Operational ownership transferred to Builder'
      });
      await logEvent({ registrationId, eventType: 'PARTNER_ATTRIBUTION_PRESERVED', actor: 'SYSTEM', newValue: registration.partnerId, description: 'Partner attribution preserved' });

      const commissionId = await nextId('COMM');
      const commission = await CommissionEligibility.create({
        commissionId,
        registrationId,
        partnerId: registration.partnerId,
        bookingId,
        projectId: registration.projectId,
        attributionStatus: 'ATTRIBUTED',
        eligibilityStatus: 'ELIGIBLE'
      });

      await logEvent({ registrationId, eventType: 'COMMISSION_ELIGIBILITY_CREATED', actor: 'SYSTEM', newValue: commission.commissionId, description: 'Commission eligibility created' });
      await logEvent({ registrationId, eventType: 'HANDOVER_COMPLETED', actor: 'SYSTEM', description: 'Handover completed' });

      return {
        bookingId,
        registrationId,
        operationalOwner: 'BUILDER',
        partnerAttribution: registration.partnerId,
        commissionEligibility: commission.eligibilityStatus,
        handover: 'Completed'
      };
    });

    return res.status(replayed ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/registrations/:registrationId/audit
async function getMyRegistrationAudit(req, res, next) {
  try {
    const { registration, error } = await assertOwnedRegistration(req.params.registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const events = await getTimeline(registration.registrationId);
    return res.json({ registrationId: registration.registrationId, events });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMyRegistrations,
  createMyRegistration,
  getMyRegistration,
  updateMyProgress,
  createMyBooking,
  getMyRegistrationAudit
};

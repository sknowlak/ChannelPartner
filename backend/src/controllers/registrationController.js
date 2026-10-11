const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const ProgressEvent = require('../models/ProgressEvent');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { findDuplicate, findOrCreateCustomer, claimProtection } = require('../services/duplicateService');
const { createInitialOwnership, getOwnership } = require('../services/ownershipService');
const { logEvent } = require('../services/auditService');
const { withIdempotency } = require('../services/idempotencyService');
const { getDefaultStatusName, listStatuses, resolveStatus } = require('../services/leadStatusService');
const { buildBuilderView } = require('../services/visibilityService');
const { getSettings } = require('../services/settingsService');
const { validateMobile } = require('../utils/phone');
const Booking = require('../models/Booking');
const { isValidEmail } = require('../utils/email');

// POST /api/channel-partner/registrations
async function createRegistration(req, res, next) {
  try {
    const { customer, source, externalReferenceId } = req.body;
    const partnerId = req.body.partnerId ? String(req.body.partnerId) : '';
    const projectId = req.body.projectId ? String(req.body.projectId) : '';

    if (!partnerId || !projectId || !customer || typeof customer !== 'object' || !customer.mobile || !customer.name) {
      return res.status(400).json({ status: 'ERROR', reason: 'partnerId, projectId and customer.name/mobile are required' });
    }

    const mobileCheck = validateMobile(customer.mobile);
    if (!mobileCheck.valid) return res.status(400).json({ status: 'ERROR', reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
    customer.mobile = mobileCheck.e164;
    if (customer.email && !isValidEmail(String(customer.email))) {
      return res.status(400).json({ status: 'ERROR', reason: 'Enter a valid email address', fieldKey: 'email' });
    }

    // A deactivated partner can't register leads through any route - they
    // could otherwise still lock customers away from active partners.
    const partner = await Partner.findOne({ partnerId });
    if (!partner || partner.status !== 'ACTIVE') {
      return res.status(400).json({ status: 'ERROR', reason: `Unknown or inactive partnerId: ${partnerId}` });
    }

    const { result } = await withIdempotency(externalReferenceId, 'createRegistration', async () => {
      const rejectDuplicate = async (existingRegistrationId, protectedUntil) => {
        await logEvent({
          registrationId: existingRegistrationId,
          eventType: 'REGISTRATION_ATTEMPT_REJECTED',
          actor: partnerId,
          source: source || 'PARTNER_CRM',
          description: `Duplicate registration attempt by ${partnerId} rejected`
        });
        return {
          status: 'REJECTED',
          reasonCode: 'DUPLICATE_PROTECTED',
          reason: 'Customer is already registered by another partner.',
          protectedUntil
        };
      };

      const duplicate = await findDuplicate({ mobile: customer.mobile, email: customer.email, projectId });
      if (duplicate) return rejectDuplicate(duplicate.registrationId, duplicate.protectionExpiry);

      const customerDoc = await findOrCreateCustomer({ name: customer.name, mobile: customer.mobile, email: customer.email });

      const { duplicateProtectionDays } = await getSettings();
      const registrationId = await nextId('REG');
      const registeredAt = new Date();
      const protectionExpiry = new Date(registeredAt.getTime() + duplicateProtectionDays * 24 * 60 * 60 * 1000);

      const claim = await claimProtection({ customerId: customerDoc.customerId, projectId, registrationId, partnerId, expiresAt: protectionExpiry });
      if (!claim.claimed) return rejectDuplicate(claim.holder.registrationId, claim.holder.expiresAt);

      const registration = await Registration.create({
        registrationId,
        customerId: customerDoc.customerId,
        partnerId,
        projectId,
        status: 'ACCEPTED',
        currentStage: await getDefaultStatusName(partnerId),
        registeredAt,
        protectionStart: registeredAt,
        protectionExpiry,
        externalReferenceId,
        source: source || 'PARTNER_CRM'
      });

      await createInitialOwnership(registrationId, partnerId);

      const eventId = await nextId('PROG');
      await ProgressEvent.create({
        eventId,
        registrationId,
        stage: registration.currentStage,
        eventType: 'REGISTRATION_CREATED',
        source: source || 'PARTNER_CRM'
      });

      await logEvent({
        registrationId,
        eventType: 'REGISTRATION_RECEIVED',
        actor: partnerId,
        source: source || 'PARTNER_CRM',
        description: 'Partner registration received'
      });
      await logEvent({
        registrationId,
        eventType: 'DUPLICATE_CHECK_COMPLETED',
        actor: 'SYSTEM',
        description: 'Duplicate check completed - no active duplicate found'
      });
      await logEvent({
        registrationId,
        eventType: 'REGISTRATION_ACCEPTED',
        actor: 'SYSTEM',
        description: 'Registration accepted'
      });
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
    }, partnerId);

    const httpStatus = result.status === 'REJECTED' ? 409 : 201;
    return res.status(httpStatus).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/registrations/:registrationId?view=partner|builder
async function getRegistration(req, res, next) {
  try {
    const { registrationId } = req.params;
    const view = req.query.view || 'partner';

    const registration = await Registration.findOne({ registrationId });
    if (!registration) return res.status(404).json({ reason: 'Registration not found' });

    const customer = await Customer.findOne({ customerId: registration.customerId });
    const ownership = await getOwnership(registrationId);
    const booking = await Booking.findOne({ registrationId });

    if (view === 'builder') {
      return res.json(await buildBuilderView({ registration, customer, ownership, booking }));
    }

    return res.json({
      registrationId: registration.registrationId,
      status: registration.status,
      partnerId: registration.partnerId,
      projectId: registration.projectId,
      currentStage: registration.currentStage,
      protectionExpiry: registration.protectionExpiry,
      isBooked: registration.isBooked,
      customer,
      ownership
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/registrations/:registrationId/progress
async function updateProgress(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { eventType, source, actor } = req.body;
    const stage = String(req.body.stage || '');

    if (actor === 'BUILDER') {
      return res.status(403).json({ reason: 'Builder cannot modify partner-owned progress before booking' });
    }

    const registration = await Registration.findOne({ registrationId: String(registrationId) });
    if (!registration) return res.status(404).json({ reason: 'Registration not found' });

    // Same rules as the logged-in status update: a booked lead belongs to the
    // builder, and the booking status is only reachable through the booking
    // event (which creates the Booking + commission records) - setting it as
    // a plain stage would mark a lead "booked" with neither.
    if (registration.isBooked) {
      return res.status(409).json({ reason: 'This lead is booked - its status is now managed by the builder' });
    }
    const resolved = await resolveStatus(registration.partnerId, stage, '');
    if (resolved.error) return res.status(400).json({ reason: resolved.error });
    if (resolved.status.isBooking) return res.status(400).json({ reason: 'Use the booking endpoint to book a lead' });
    if (!resolved.status.isActive) return res.status(400).json({ reason: `"${stage}" is inactive` });

    const previousStage = registration.currentStage;
    registration.currentStage = stage;
    registration.subStatus = '';
    await registration.save();

    const eventId = await nextId('PROG');
    await ProgressEvent.create({
      eventId,
      registrationId,
      stage,
      eventType: eventType || 'STAGE_UPDATED',
      source: source || 'PARTNER_CRM'
    });

    await logEvent({
      registrationId,
      eventType: 'STAGE_UPDATED',
      actor: registration.partnerId,
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

// GET /registrations/:registrationId/statuses - the owning partner's active
// status names in their configured order (section 49), so the mobile app's
// "advance to next status" follows the partner's own custom pipeline.
async function listRegistrationStatuses(req, res, next) {
  try {
    const registration = await Registration.findOne({ registrationId: req.params.registrationId });
    if (!registration) return res.status(404).json({ reason: 'Registration not found' });
    const statuses = await listStatuses(registration.partnerId);
    return res.json({ statuses: statuses.filter((s) => s.isActive && !s.isBooking).map((s) => s.name) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRegistrationStatuses, createRegistration, getRegistration, updateProgress };

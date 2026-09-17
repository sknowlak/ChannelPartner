const Registration = require('../models/Registration');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const { nextId } = require('../utils/idGenerator');
const { transferOperationalOwnershipToBuilder } = require('../services/ownershipService');
const { logEvent } = require('../services/auditService');
const { withIdempotency } = require('../services/idempotencyService');

// POST /api/channel-partner/registrations/:registrationId/booking
// The responsibility-transfer event (spec section 13): creates the booking,
// flips operational ownership to the builder while the partner keeps
// attribution, and creates the commission-eligibility record.
async function createBooking(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { externalEventId } = req.body;

    const registration = await Registration.findOne({ registrationId });
    if (!registration) return res.status(404).json({ reason: 'Registration not found' });

    const { replayed, result } = await withIdempotency(externalEventId, 'createBooking', async () => {
      const bookingId = await nextId('BOOK');
      const booking = await Booking.create({
        bookingId,
        registrationId,
        projectId: registration.projectId,
        externalEventId
      });

      await logEvent({ registrationId, eventType: 'BOOKING_COMPLETED', actor: registration.partnerId, description: 'Booking completed' });

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
      await logEvent({
        registrationId,
        eventType: 'PARTNER_ATTRIBUTION_PRESERVED',
        actor: 'SYSTEM',
        newValue: registration.partnerId,
        description: 'Partner attribution preserved'
      });

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

module.exports = { createBooking };

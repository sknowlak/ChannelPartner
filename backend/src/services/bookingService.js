const Registration = require('../models/Registration');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const { nextId } = require('../utils/idGenerator');
const { transferOperationalOwnershipToBuilder } = require('./ownershipService');
const { logEvent } = require('./auditService');
const { withIdempotency } = require('./idempotencyService');
const { getBookingStatusName } = require('./leadStatusService');

function rejection(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Can this registration still be booked? Not if it was rejected, and not if
// its protection lapsed and another registration of the same customer for
// the same project has since taken over - the original partner lost that
// customer, so booking the stale lead (and collecting commission) is refused.
async function bookingProblem(registration) {
  if (registration.status !== 'ACCEPTED') return 'Only an accepted registration can be booked';
  if (registration.isBooked) return 'This lead is already booked';
  // Booking is the builder's action on a referral it has accepted (section 52).
  if (!registration.projectId || registration.referralStatus === 'NOT_REFERRED') return 'This lead is not referred to a project';
  if (registration.referralStatus === 'REJECTED') return 'This referral was rejected and cannot be booked';
  if (registration.referralStatus !== 'ACCEPTED') return 'Accept the referral before confirming the booking';
  const supersededBy = await Registration.findOne({
    customerId: registration.customerId,
    projectId: registration.projectId || '',
    status: 'ACCEPTED',
    registrationId: { $ne: registration.registrationId },
    registeredAt: { $gt: registration.registeredAt },
    protectionExpiry: { $gt: new Date() }
  });
  if (supersededBy) return 'Protection on this lead expired and the customer has since been registered by another partner';
  return null;
}

// The responsibility-transfer event (spec section 13): creates the booking,
// flips operational ownership to the builder while the partner keeps
// attribution, and creates the commission-eligibility record. Called from
// the builder portal only (section 52) - partners can't confirm bookings. `afterBooked(registration)` runs once the lead is booked
// (notifications, webhooks).
async function completeBooking({ registration, actorLabel, externalEventId, afterBooked }) {
  const { registrationId, partnerId } = registration;

  return withIdempotency(externalEventId, 'createBooking', async () => {
    const problem = await bookingProblem(registration);
    if (problem) throw rejection(409, problem);

    // Atomic gate: only one request can flip isBooked false -> true, so two
    // simultaneous bookings (with or without an event ID) can't both create
    // a booking and a commission record - and a rejection that lands at the
    // same moment wins over the booking.
    const claimed = await Registration.findOneAndUpdate(
      { registrationId, isBooked: { $ne: true }, referralStatus: 'ACCEPTED' },
      { $set: { isBooked: true } },
      { new: true }
    );
    if (!claimed) throw rejection(409, 'This lead is already booked');

    const bookingId = await nextId('BOOK');
    try {
      await Booking.create({ bookingId, registrationId, projectId: registration.projectId || '', externalEventId });
    } catch (err) {
      // Nothing was booked - open the gate again so the booking can be retried.
      await Registration.updateOne({ registrationId }, { $set: { isBooked: false } });
      throw err;
    }

    await logEvent({ registrationId, eventType: 'BOOKING_COMPLETED', actor: actorLabel, description: 'Booking completed' });

    await transferOperationalOwnershipToBuilder(registrationId);
    claimed.currentStage = await getBookingStatusName(partnerId);
    claimed.subStatus = '';
    claimed.scheduledAt = null;
    await claimed.save();

    await logEvent({
      registrationId,
      eventType: 'OPERATIONAL_OWNERSHIP_TRANSFERRED',
      actor: 'SYSTEM',
      previousValue: partnerId,
      newValue: 'BUILDER',
      description: 'Operational ownership transferred to Builder'
    });
    await logEvent({ registrationId, eventType: 'PARTNER_ATTRIBUTION_PRESERVED', actor: 'SYSTEM', newValue: partnerId, description: 'Partner attribution preserved' });

    const commissionId = await nextId('COMM');
    const commission = await CommissionEligibility.create({
      commissionId,
      registrationId,
      partnerId,
      bookingId,
      projectId: registration.projectId || '',
      attributionStatus: 'ATTRIBUTED',
      eligibilityStatus: 'ELIGIBLE'
    });

    await logEvent({ registrationId, eventType: 'COMMISSION_ELIGIBILITY_CREATED', actor: 'SYSTEM', newValue: commission.commissionId, description: 'Commission eligibility created' });
    await logEvent({ registrationId, eventType: 'HANDOVER_COMPLETED', actor: 'SYSTEM', description: 'Handover completed' });

    // Side effects only - a failure here must not undo a completed booking.
    if (afterBooked) {
      Promise.resolve()
        .then(() => afterBooked(claimed))
        .catch((err) => console.error('[booking] post-booking hook failed', err));
    }

    return {
      bookingId,
      registrationId,
      operationalOwner: 'BUILDER',
      partnerAttribution: partnerId,
      commissionEligibility: commission.eligibilityStatus,
      handover: 'Completed'
    };
  }, partnerId);
}

module.exports = { completeBooking, bookingProblem };

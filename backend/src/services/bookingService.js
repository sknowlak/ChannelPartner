const Registration = require('../models/Registration');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const Ownership = require('../models/Ownership');
const { nextId } = require('../utils/idGenerator');
const { transferOperationalOwnershipToBuilder } = require('./ownershipService');
const { logEvent } = require('./auditService');
const { withIdempotency } = require('./idempotencyService');
const { getBookingStatusName } = require('./leadStatusService');
const { findBookedDuplicate } = require('./duplicateService');

function rejection(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Can this registration still be booked? Not if it was rejected, and not if
// its protection lapsed and another registration of the same customer for
// the same project has since taken over - the original partner lost that
// customer, so booking the stale lead (and collecting commission) is refused.
// Nor if the same person is already BOOKED for this project through another
// registration - one buyer, one commission.
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
  if (await findBookedDuplicate(registration)) return 'This customer is already booked for this project through another registration';
  return null;
}

// A lead whose isBooked flag is set but whose handover never finished (the
// process failed after the booking but before the commission record) - a
// retry completes the remaining steps instead of answering "already booked".
async function unfinishedBooking(registrationId) {
  const [booking, commission] = await Promise.all([
    Booking.findOne({ registrationId }),
    CommissionEligibility.findOne({ registrationId })
  ]);
  return booking && !commission ? booking : null;
}

// The commission record, created at most once per lead (unique
// registrationId) - a concurrent retry just gets the one that won.
async function ensureCommission({ registrationId, partnerId, bookingId, projectId }) {
  const existing = await CommissionEligibility.findOne({ registrationId });
  if (existing) return { commission: existing, created: false };
  try {
    const commission = await CommissionEligibility.create({
      commissionId: await nextId('COMM'),
      registrationId,
      partnerId,
      bookingId,
      projectId,
      attributionStatus: 'ATTRIBUTED',
      eligibilityStatus: 'ELIGIBLE'
    });
    return { commission, created: true };
  } catch (err) {
    if (err.code !== 11000) throw err;
    return { commission: await CommissionEligibility.findOne({ registrationId }), created: false };
  }
}

// The responsibility-transfer event (spec section 13): creates the booking,
// flips operational ownership to the builder while the partner keeps
// attribution, and creates the commission-eligibility record. Called from
// the builder portal only (section 52) - partners can't confirm bookings. `afterBooked(registration)` runs once the lead is booked
// (notifications, webhooks).
//
// Every step after the booking itself is safe to repeat, so a booking that
// failed part-way (booked, but no commission yet) is finished by retrying.
async function completeBooking({ registration, actorLabel, externalEventId, afterBooked }) {
  const { registrationId, partnerId } = registration;

  return withIdempotency(externalEventId, 'createBooking', async () => {
    let claimed;
    let bookingId;
    const resumed = registration.isBooked ? await unfinishedBooking(registrationId) : null;

    if (resumed) {
      claimed = await Registration.findOne({ registrationId });
      bookingId = resumed.bookingId;
    } else {
      const problem = await bookingProblem(registration);
      if (problem) throw rejection(409, problem);

      // Atomic gate: only one request can flip isBooked false -> true, so two
      // simultaneous bookings (with or without an event ID) can't both create
      // a booking and a commission record - and a rejection that lands at the
      // same moment wins over the booking.
      claimed = await Registration.findOneAndUpdate(
        { registrationId, isBooked: { $ne: true }, referralStatus: 'ACCEPTED' },
        { $set: { isBooked: true } },
        { new: true }
      );
      if (!claimed) throw rejection(409, 'This lead is already booked');

      bookingId = await nextId('BOOK');
      try {
        await Booking.create({ bookingId, registrationId, projectId: registration.projectId || '', externalEventId });
      } catch (err) {
        // Nothing was booked - open the gate again so the booking can be retried.
        await Registration.updateOne({ registrationId }, { $set: { isBooked: false } });
        throw err;
      }

      await logEvent({ registrationId, eventType: 'BOOKING_COMPLETED', actor: actorLabel, description: 'Booking completed' });
    }

    // Ownership + booking stage - skipped when an earlier attempt got that far.
    const ownership = await Ownership.findOne({ registrationId });
    if (!ownership || ownership.operationalOwner !== 'BUILDER' || ownership.ownershipStatus !== 'BUILDER_OWNED') {
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
    }

    const { commission, created } = await ensureCommission({ registrationId, partnerId, bookingId, projectId: registration.projectId || '' });
    if (created) {
      await logEvent({ registrationId, eventType: 'COMMISSION_ELIGIBILITY_CREATED', actor: 'SYSTEM', newValue: commission.commissionId, description: 'Commission eligibility created' });
      await logEvent({ registrationId, eventType: 'HANDOVER_COMPLETED', actor: 'SYSTEM', description: 'Handover completed' });
    }

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
  // Scoped to the partner AND the lead: the same event ID sent for another
  // lead must not replay this lead's booking result.
  }, `${partnerId}:${registrationId}`);
}

module.exports = { completeBooking, bookingProblem };

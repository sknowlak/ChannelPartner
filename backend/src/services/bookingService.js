const Registration = require('../models/Registration');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const Ownership = require('../models/Ownership');
const { nextId } = require('../utils/idGenerator');
const { transferOperationalOwnershipToBuilder } = require('./ownershipService');
const { logEvent } = require('./auditService');
const { withIdempotency } = require('./idempotencyService');
const { getBookingStatusName, getDefaultStatusName } = require('./leadStatusService');
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
async function ensureCommission({ registrationId, partnerId, bookingId, projectId, disputed }) {
  // An ownership dispute open on the lead (section 62) marks the attribution.
  const attributionStatus = disputed ? 'DISPUTED' : 'ATTRIBUTED';
  const existing = await CommissionEligibility.findOne({ registrationId });
  // Re-booked after a cancellation (section 62): the same record becomes
  // eligible again for the new booking - still one commission per lead.
  if (existing && existing.eligibilityStatus === 'CANCELLED') {
    existing.eligibilityStatus = 'ELIGIBLE';
    existing.attributionStatus = attributionStatus;
    existing.bookingId = bookingId;
    existing.partnerId = partnerId;
    await existing.save();
    return { commission: existing, created: true, restored: true };
  }
  if (existing) return { commission: existing, created: false };
  try {
    const commission = await CommissionEligibility.create({
      commissionId: await nextId('COMM'),
      registrationId,
      partnerId,
      bookingId,
      projectId,
      attributionStatus,
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

      const stageBeforeBooking = claimed.currentStage || '';
      try {
        // A lead whose earlier booking was cancelled (section 62) re-uses that
        // booking record - one booking per lead stays true.
        const cancelled = await Booking.findOne({ registrationId, status: 'CANCELLED' });
        if (cancelled) {
          bookingId = cancelled.bookingId;
          cancelled.set({ status: 'CONFIRMED', bookingDate: new Date(), externalEventId, stageBeforeBooking, cancelledAt: undefined, cancelledBy: undefined, cancellationReason: undefined });
          await cancelled.save();
        } else {
          bookingId = await nextId('BOOK');
          await Booking.create({ bookingId, registrationId, projectId: registration.projectId || '', externalEventId, stageBeforeBooking });
        }
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

    const { commission, created, restored } = await ensureCommission({ registrationId, partnerId, bookingId, projectId: registration.projectId || '', disputed: claimed.disputeStatus === 'OPEN' });
    if (restored) {
      await logEvent({ registrationId, eventType: 'COMMISSION_ELIGIBILITY_RESTORED', actor: 'SYSTEM', newValue: commission.commissionId, description: 'Commission eligibility restored for the new booking' });
      await logEvent({ registrationId, eventType: 'HANDOVER_COMPLETED', actor: 'SYSTEM', description: 'Handover completed' });
    } else if (created) {
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

// Cancels a confirmed booking (section 62) - the builder's (or an admin's)
// action when a buyer backs out. Everything the booking did is undone except
// the history: the booking and commission records stay, marked CANCELLED;
// operational ownership returns to the partner, who keeps attribution and
// can work the customer again; the lead goes back to its pre-booking stage.
// Protection reverts to the lead's original window - a booked lead was
// protected permanently, a cancelled one only until its protectionExpiry.
// `afterCancelled(registration)` runs once done (webhooks).
async function cancelBooking({ registration, actorLabel, reason, afterCancelled }) {
  const { registrationId, partnerId } = registration;
  const why = String(reason || '').trim().slice(0, 500);
  if (!why) throw rejection(400, 'A reason is required to cancel a booking');

  // Atomic gate: only one cancel can flip isBooked true -> false.
  const claimed = await Registration.findOneAndUpdate(
    { registrationId, isBooked: true },
    { $set: { isBooked: false } },
    { new: true }
  );
  if (!claimed) throw rejection(409, 'This lead is not booked');

  const booking = await Booking.findOne({ registrationId });
  if (booking) {
    booking.set({ status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: actorLabel, cancellationReason: why });
    await booking.save();
  }
  await logEvent({ registrationId, eventType: 'BOOKING_CANCELLED', actor: actorLabel, newValue: { reason: why }, description: `Booking cancelled. Reason: ${why}` });

  await Ownership.updateMany({ registrationId }, { $set: { operationalOwner: partnerId, ownershipStatus: 'PARTNER_OWNED' } });
  claimed.currentStage = booking?.stageBeforeBooking || (await getDefaultStatusName(partnerId));
  claimed.subStatus = '';
  claimed.scheduledAt = null;
  await claimed.save();
  await logEvent({
    registrationId,
    eventType: 'OPERATIONAL_OWNERSHIP_RETURNED',
    actor: 'SYSTEM',
    previousValue: 'BUILDER',
    newValue: partnerId,
    description: 'Operational ownership returned to the partner'
  });

  const commission = await CommissionEligibility.findOneAndUpdate(
    { registrationId, eligibilityStatus: { $ne: 'CANCELLED' } },
    { $set: { eligibilityStatus: 'CANCELLED' } },
    { new: true }
  );
  if (commission) {
    await logEvent({ registrationId, eventType: 'COMMISSION_ELIGIBILITY_CANCELLED', actor: 'SYSTEM', newValue: commission.commissionId, description: 'Commission eligibility cancelled with the booking' });
  }

  if (afterCancelled) {
    Promise.resolve()
      .then(() => afterCancelled(claimed))
      .catch((err) => console.error('[booking] post-cancellation hook failed', err));
  }

  return {
    registrationId,
    bookingId: booking?.bookingId || null,
    bookingStatus: 'CANCELLED',
    operationalOwner: partnerId,
    partnerAttribution: partnerId,
    commissionEligibility: 'CANCELLED',
    currentStage: claimed.currentStage
  };
}

module.exports = { completeBooking, bookingProblem, cancelBooking };

const Registration = require('../models/Registration');
const { completeBooking } = require('../services/bookingService');

// POST /api/channel-partner/registrations/:registrationId/booking
// The responsibility-transfer event (spec section 13) - see
// bookingService.completeBooking for the rules (no double booking, no
// booking a lead another partner has since taken over).
async function createBooking(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { externalEventId } = req.body;

    const registration = await Registration.findOne({ registrationId: String(registrationId) });
    if (!registration) return res.status(404).json({ reason: 'Registration not found' });

    const { replayed, result } = await completeBooking({
      registration,
      actorLabel: registration.partnerId,
      externalEventId
    });

    return res.status(replayed ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createBooking };

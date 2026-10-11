const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    // One booking per lead (also enforced in code by bookingService's atomic
    // isBooked gate, which covers databases that already hold duplicates).
    registrationId: { type: String, required: true, unique: true },
    // '' for leads with no project attached (section 33) - `required` used to
    // reject those, so they could never be booked.
    projectId: { type: String, default: '' },
    bookingDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['CONFIRMED', 'CANCELLED'], default: 'CONFIRMED' },
    externalEventId: { type: String, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);

const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    registrationId: { type: String, required: true, index: true },
    projectId: { type: String, required: true },
    bookingDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['CONFIRMED', 'CANCELLED'], default: 'CONFIRMED' },
    externalEventId: { type: String, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);

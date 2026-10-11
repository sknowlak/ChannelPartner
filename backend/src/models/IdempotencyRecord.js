const mongoose = require('mongoose');

// Stores the response produced for a given external event/route pair so a
// retried external event (spec section 16) replays the original result
// instead of re-running the operation.
const idempotencyRecordSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    // Includes the partner scope, e.g. "createMyBooking:PARTNER-001".
    routeName: { type: String, required: true },
    // PENDING while the operation runs (the key is claimed first), DONE once
    // `response` is stored. Records from before this field existed are DONE.
    state: { type: String, enum: ['PENDING', 'DONE'], default: 'DONE' },
    response: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

idempotencyRecordSchema.index({ key: 1, routeName: 1 }, { unique: true });

module.exports = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);

const mongoose = require('mongoose');

// Backs sequential, human-readable IDs (REG-10001, BOOK-90001, ...) instead
// of raw ObjectIds, matching the ID style used throughout the spec examples.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true }
});

module.exports = mongoose.model('Counter', counterSchema);

const mongoose = require('mongoose');

// Sessions ended by logging out (section 62). Only a SHA-256 of the token is
// kept, never the token itself, and each entry deletes itself (TTL index)
// once the token would have expired anyway.
const revokedTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);

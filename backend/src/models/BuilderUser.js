const mongoose = require('mongoose');

// A person who logs in to the builder portal for one Builder (section 52).
// Builder sessions are a separate token type from admin and partner ones.
const builderUserSchema = new mongoose.Schema(
  {
    builderUserId: { type: String, required: true, unique: true },
    builderId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Tokens issued before this instant are rejected (see builderAuth).
    passwordChangedAt: Date,
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    lastLoginAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model('BuilderUser', builderUserSchema);

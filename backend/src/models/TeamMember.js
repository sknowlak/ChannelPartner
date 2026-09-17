const mongoose = require('mongoose');

// A user a channel partner (the account "owner") adds to their own team so
// more than one person can work the same pool of leads. Team members log in
// through the same /partners/login endpoint as the owner and get a session
// scoped to the same partnerId (see partnerAuthController), but only the
// owner can manage the team itself (section 32).
const teamMemberSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    mobile: String,
    email: String,
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    timezone: { type: String, default: 'UTC' },
    createdBy: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('TeamMember', teamMemberSchema);

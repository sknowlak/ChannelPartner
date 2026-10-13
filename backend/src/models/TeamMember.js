const mongoose = require('mongoose');
const { isSupportedLanguage } = require('../config/languages');

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
    // Tokens issued before this instant are rejected (see partnerAuth).
    passwordChangedAt: Date,
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    // References Role.roleId (section 34) - determines what this member can
    // do beyond viewing the shared lead pool, which is never gated.
    roleId: { type: String, required: true },
    timezone: { type: String, default: '' }, // '' = Automatic (device timezone, section 60)
    deviceTimezone: { type: String, default: '' },
    // Preferred UI language (sections 54-55) - '' = not chosen yet (device/browser
    // decides). Any language in config/languages.json (the generated manifest).
    language: { type: String, default: '', validate: { validator: (v) => v === '' || isSupportedLanguage(v), message: 'Unsupported language' } },
    createdBy: String,

    // Values for any partner-added custom user field (section 38) - keyed
    // by UserFieldDefinition.fieldKey, same pattern as Registration.customFields.
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Per-grid column layout ({ [gridKey]: { order: [...], hidden: [...] } }) -
    // this member's own "Manage Columns" choice, so it follows their account
    // to any device/browser instead of living in that browser's localStorage.
    gridPreferences: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TeamMember', teamMemberSchema);

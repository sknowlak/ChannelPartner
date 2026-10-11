const mongoose = require('mongoose');
const { normalizeMobile, validatePhoneNumber } = require('../utils/phone');
const { normalizeEmail } = require('../utils/email');

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    // Canonical value (validateMobile/validatePhoneNumber already normalize
    // to E.164 before a Customer is ever created or updated - see every
    // controller under src/controllers that touches `mobile`) - this IS the
    // "phone_number_e164" field; `mobileE164` below is just a same-named
    // virtual alias so code/queries can call it that explicitly too.
    mobile: { type: String, required: true, index: true },
    // Structured breakdown of `mobile`, derived automatically (never set
    // directly) so it can't drift out of sync with the canonical value.
    mobileCountryCode: { type: String, index: true }, // ISO 3166-1 alpha-2, e.g. "IN"
    mobileDialCode: String, // e.g. "+91"
    mobileNationalNumber: String, // e.g. "9876543210" (no country code)
    // Digits-only match key (section 7) - the same customer can arrive as
    // "+91 98765 43210" from one partner and "9876543210" from another;
    // duplicate protection and customer lookup match on this, never on the
    // raw `mobile` string, so formatting differences never split one real
    // person into two Customer records or two "unrelated" registrations.
    // Unique: this app's own invariant is one Customer per real phone
    // number (see the find-or-create lookups in registrationController.js
    // and myLeadsController.js) - the index makes that invariant durable
    // even against a race, not just "whatever the last read happened to see".
    mobileNormalized: { type: String, index: true, unique: true, sparse: true },
    email: { type: String, index: true },
    // Match key for duplicate detection (utils/email.js): trimmed,
    // lowercased, "+tag" removed - so `Victim@Gmail.com ` and
    // `victim+1@gmail.com` are recognised as the same customer.
    emailNormalized: { type: String, index: true },
    alternateMobile: String,
    // Digits-only key for the alternate number, so a customer can't be
    // registered again by a second partner using their other phone.
    alternateMobileNormalized: { type: String, index: true }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

customerSchema.virtual('mobileE164').get(function getMobileE164() {
  return this.mobile;
});

// Defense in depth: every controller that touches `mobile` already
// validates + normalizes it before calling save()/create() (so this
// re-parse is normally a no-op), but the model itself is the last line of
// enforcement for "the E.164 result is the canonical value that gets
// saved" - if `mobile` is ever set directly bypassing that layer, this
// still rewrites it to canonical E.164 rather than silently persisting
// whatever raw string was given.
customerSchema.pre('validate', function computeMobileFields(next) {
  if (this.isModified('mobile')) {
    const parsed = validatePhoneNumber(this.mobile, undefined);
    if (parsed.valid) {
      this.mobile = parsed.e164;
      this.mobileCountryCode = parsed.country;
      this.mobileDialCode = parsed.dialCode;
      this.mobileNationalNumber = parsed.nationalNumber;
    }
    this.mobileNormalized = normalizeMobile(this.mobile);
  }
  if (this.isModified('email') || (this.email && !this.emailNormalized)) {
    this.email = this.email ? String(this.email).trim() : this.email;
    this.emailNormalized = this.email ? normalizeEmail(this.email) : undefined;
  }
  if (this.isModified('alternateMobile') || (this.alternateMobile && !this.alternateMobileNormalized)) {
    this.alternateMobileNormalized = this.alternateMobile ? normalizeMobile(this.alternateMobile) : undefined;
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);

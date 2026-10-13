const mongoose = require('mongoose');
const { normalizeMobile, validatePhoneNumber } = require('../utils/phone');
const { normalizeEmail } = require('../utils/email');

// This partner's OWN copy of the customer's contact details (section 52).
// Customer documents are shared by every partner who registers the same
// phone number, so reading or writing contact details there leaked one
// partner's data to another; partners now only ever see and edit this copy.
const contactSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    mobile: { type: String, default: '' }, // E.164
    mobileCountryCode: String,
    mobileDialCode: String,
    mobileNationalNumber: String,
    email: { type: String, default: '' },
    alternateMobile: { type: String, default: '' }
  },
  { _id: false }
);

const registrationSchema = new mongoose.Schema(
  {
    registrationId: { type: String, required: true, unique: true },
    // The shared identity record (one per phone number) - used for the
    // protection claim key, never to show or edit contact details.
    customerId: { type: String, required: true, index: true },
    contact: { type: contactSchema, default: () => ({}) },
    // Normalized duplicate-matching keys derived from `contact` (section 52):
    // duplicate checks query these instead of the shared Customer record.
    match: {
      mobile: { type: String, default: '' },
      alternateMobile: { type: String, default: '' },
      email: { type: String, default: '' }
    },
    // The builder's decision on this referral (section 52). Leads with no
    // project aren't referred to anyone yet.
    referralStatus: {
      type: String,
      enum: ['NOT_REFERRED', 'PENDING_BUILDER', 'ACCEPTED', 'REJECTED'],
      default: 'NOT_REFERRED',
      index: true
    },
    referralDecision: {
      decidedBy: String,
      decidedAt: Date,
      reason: String
    },
    partnerId: { type: String, required: true, index: true },
    // Optional (section 33) - the self-service "Register New Lead" form only
    // requires the customer's name and mobile; a lead may not yet have a
    // specific project attached. Defaults to '' so duplicate-protection
    // scoping (by project) stays consistent for "no project" leads too.
    projectId: { type: String, default: '' },
    status: { type: String, enum: ['ACCEPTED', 'REJECTED'], required: true },
    // The NAME of one of the partner's own LeadStatus documents (section 49 -
    // statuses are fully custom, so no fixed enum; validated against the
    // partner's catalogue by leadStatusService.resolveStatus instead).
    currentStage: { type: String, default: 'Registered' },
    // Second-level status within currentStage (section 48), e.g. Contacted ->
    // "Not Answered" - a LeadStatus.subStatuses[].name.
    subStatus: { type: String, default: '' },
    // Date & time attached to a status that asks for one (a callback, a site
    // visit) - what "N minutes before" notification rules count back from.
    scheduledAt: { type: Date, default: null },
    registeredAt: { type: Date, default: Date.now },
    protectionStart: Date,
    protectionExpiry: Date,
    rejectionReason: String,
    externalReferenceId: String,
    source: {
      type: String,
      enum: ['LEADRAT', 'SIMULATED_EXTERNAL_CRM', 'PARTNER_CRM', 'EXTERNAL_API', 'INTEGRATION_CONNECTOR', 'LINKEDIN'],
      default: 'PARTNER_CRM'
    },
    isBooked: { type: Boolean, default: false },

    // Which of the partner's own team members is working this lead
    // day-to-day - independent of partnerId (which never changes once
    // registered) and of ownershipService's working/operational owner
    // (which is about partner-vs-builder, not partner-vs-partner's-own-staff).
    // '' means unassigned. Stores TeamMember.memberId, or the partnerId
    // itself when assigned to the account owner (the owner isn't a
    // TeamMember row) - section 48.
    assignedTo: { type: String, default: '' },

    // Real-estate lead requirement details (section 33) - all optional. These
    // stay plain (unconstrained) strings rather than Mongoose enums because
    // their actual allowed values live in LeadFieldDefinition.options
    // (section 36/39) and are partner-editable - a hardcoded schema enum
    // would fight that and risk a save failing on a partner-added option.
    requirementType: { type: String, default: '' },
    propertyType: { type: String, default: '' },
    bhk: { type: String, default: '' },
    budgetMin: Number,
    budgetMax: Number,
    preferredLocation: String,
    possessionTimeline: { type: String, default: '' },
    leadSource: { type: String, default: '' },
    notes: String,

    // Values for any partner-added custom lead field (section 36) - keyed
    // by LeadFieldDefinition.fieldKey, same pattern as Partner.customFields.
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

registrationSchema.index({ 'match.mobile': 1, projectId: 1 });
registrationSchema.index({ 'match.alternateMobile': 1, projectId: 1 });
registrationSchema.index({ 'match.email': 1, projectId: 1 });
registrationSchema.index({ projectId: 1, referralStatus: 1 });

// Keeps the phone breakdown and the match keys in step with `contact`.
registrationSchema.pre('validate', function deriveContactKeys(next) {
  const c = this.contact || {};
  if (this.isModified('contact.mobile') || (c.mobile && !this.match?.mobile)) {
    const parsed = c.mobile ? validatePhoneNumber(c.mobile, undefined) : { valid: false };
    if (parsed.valid) {
      this.contact.mobile = parsed.e164;
      this.contact.mobileCountryCode = parsed.country;
      this.contact.mobileDialCode = parsed.dialCode;
      this.contact.mobileNationalNumber = parsed.nationalNumber;
    }
    this.match.mobile = c.mobile ? normalizeMobile(this.contact.mobile) : '';
  }
  if (this.isModified('contact.alternateMobile') || (c.alternateMobile && !this.match?.alternateMobile)) {
    this.match.alternateMobile = c.alternateMobile ? normalizeMobile(c.alternateMobile) : '';
  }
  if (this.isModified('contact.email') || (c.email && !this.match?.email)) {
    this.contact.email = c.email ? String(c.email).trim() : '';
    this.match.email = this.contact.email ? normalizeEmail(this.contact.email) : '';
  }
  next();
});

module.exports = mongoose.model('Registration', registrationSchema);

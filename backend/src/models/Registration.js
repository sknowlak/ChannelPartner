const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema(
  {
    registrationId: { type: String, required: true, unique: true },
    customerId: { type: String, required: true, index: true },
    partnerId: { type: String, required: true, index: true },
    // Optional (section 33) - the self-service "Register New Lead" form only
    // requires the customer's name and mobile; a lead may not yet have a
    // specific project attached. Defaults to '' so duplicate-protection
    // scoping (by project) stays consistent for "no project" leads too.
    projectId: { type: String, default: '' },
    status: { type: String, enum: ['ACCEPTED', 'REJECTED'], required: true },
    currentStage: {
      type: String,
      enum: ['Registered', 'Contacted', 'Qualified', 'Site Visit', 'Negotiation', 'Booking'],
      default: 'Registered'
    },
    registeredAt: { type: Date, default: Date.now },
    protectionStart: Date,
    protectionExpiry: Date,
    rejectionReason: String,
    externalReferenceId: String,
    source: {
      type: String,
      enum: ['LEADRAT', 'SIMULATED_EXTERNAL_CRM', 'PARTNER_CRM', 'EXTERNAL_API', 'INTEGRATION_CONNECTOR'],
      default: 'PARTNER_CRM'
    },
    isBooked: { type: Boolean, default: false },

    // Which of the partner's own team members is working this lead
    // day-to-day - independent of partnerId (which never changes once
    // registered) and of ownershipService's working/operational owner
    // (which is about partner-vs-builder, not partner-vs-partner's-own-staff).
    // '' means unassigned. Stores TeamMember.memberId, or '' for the owner
    // acting themselves (the owner isn't a TeamMember row).
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

module.exports = mongoose.model('Registration', registrationSchema);

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

    // Real-estate lead requirement details (section 33) - all optional.
    requirementType: { type: String, enum: ['Buy', 'Rent', 'Sell', ''], default: '' },
    propertyType: { type: String, enum: ['Apartment', 'Villa', 'Plot', 'Commercial', 'Office', 'Other', ''], default: '' },
    bhk: { type: String, enum: ['Studio', '1 BHK', '2 BHK', '3 BHK', '4+ BHK', ''], default: '' },
    budgetMin: Number,
    budgetMax: Number,
    preferredLocation: String,
    possessionTimeline: { type: String, enum: ['Immediate', '0-3 Months', '3-6 Months', '6-12 Months', '1 Year+', ''], default: '' },
    leadSource: { type: String, enum: ['Website', 'Referral', 'Walk-in', 'Property Portal', 'Social Media', 'Cold Call', 'Other', ''], default: '' },
    notes: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('Registration', registrationSchema);

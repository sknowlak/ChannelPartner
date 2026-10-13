const mongoose = require('mongoose');

// One LinkedIn Lead Gen Form submission and what Leadrat did with it
// (section 59): the lead it became, or why not (duplicate / rejected /
// failed). Drives "leads per day", per-campaign counts, cost per CRM lead,
// and the Conversions API (the LinkedIn lead ID identifies the person to
// LinkedIn without sending contact details). LinkedIn allows lead-form data
// to be stored without a time limit.
const linkedInLeadSchema = new mongoose.Schema(
  {
    partnerId: { type: String, required: true },
    leadId: { type: String, required: true }, // leadFormResponse id
    accountUrn: { type: String, default: '' },
    campaignUrn: { type: String, default: '' },
    campaignName: { type: String, default: '' },
    creativeUrn: { type: String, default: '' },
    formUrn: { type: String, default: '' },
    formName: { type: String, default: '' },
    leadType: { type: String, default: 'SPONSORED' },
    testLead: { type: Boolean, default: false },
    submittedAt: { type: Date, required: true },
    outcome: { type: String, enum: ['CREATED', 'DUPLICATE', 'REJECTED', 'FAILED'], required: true },
    message: { type: String, default: '' },
    registrationId: { type: String, default: '' },
    attempts: { type: Number, default: 1 }
  },
  { timestamps: true }
);

linkedInLeadSchema.index({ partnerId: 1, leadId: 1 }, { unique: true });
linkedInLeadSchema.index({ partnerId: 1, submittedAt: -1 });
linkedInLeadSchema.index({ partnerId: 1, registrationId: 1 });

module.exports = mongoose.model('LinkedInLead', linkedInLeadSchema);

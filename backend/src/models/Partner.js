const mongoose = require('mongoose');

// Full channel-partner registration field set. Standard fields are modeled
// directly (so they stay natively filterable/indexable); anything an admin
// adds beyond this set lives in `customFields` (see FieldDefinition/
// fieldDefinitionService) without requiring a schema migration.
const partnerSchema = new mongoose.Schema(
  {
    partnerId: { type: String, required: true, unique: true },
    partnerCode: { type: String, required: true, unique: true }, // system-generated

    // Core (mandatory)
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, required: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    // Profile
    partnerType: { type: String, enum: ['Individual', 'Company', 'Agency', ''], default: '' },
    companyName: String,
    contactPersonName: String,
    alternateMobile: String,
    alternateEmail: String,
    website: String,

    // Address
    address: String,
    addressLine2: String,
    city: String,
    state: String,
    country: String,
    pinCode: String,

    // KYC
    panNumber: String,
    gstin: String,
    reraRegistrationNumber: String,
    reraState: String,
    reraExpiryDate: Date,

    // Documents (stored as URLs - see spec section 30 for the file-upload note)
    panDocumentUrl: String,
    gstCertificateUrl: String,
    reraCertificateUrl: String,
    addressProofUrl: String,

    // Banking
    bankAccountHolderName: String,
    bankName: String,
    accountNumber: String,
    ifscCode: String,
    accountType: { type: String, enum: ['Current', 'Savings', ''], default: '' },

    // Business profile
    partnerSource: { type: String, enum: ['Direct', 'Referral', 'Existing', ''], default: '' },
    referredBy: String,
    relationshipManager: String,
    partnerCategory: { type: String, enum: ['Broker', 'Agency', 'Referral', ''], default: '' },
    operatingCities: { type: [String], default: [] },
    operatingStates: { type: [String], default: [] },
    yearsOfExperience: Number,
    numberOfSalesAgents: Number,

    // Integration
    crmName: String,
    externalPartnerId: String,
    integrationType: { type: String, enum: ['API', 'Webhook', 'Manual', ''], default: '' },

    // Agreement
    agreementNumber: String,
    agreementStartDate: Date,
    agreementExpiryDate: Date,

    // Commission
    commissionPlan: String,
    commissionType: { type: String, enum: ['Percentage', 'Fixed', ''], default: '' },
    commissionRate: Number,

    notes: String,

    // System-generated / admin-controlled only
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    kycStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
    approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED' },
    createdBy: String,
    lastLoginAt: Date,

    // IANA timezone (e.g. "Asia/Kolkata") - the app is used worldwide, so
    // every timestamp shown to this partner is rendered in this zone
    // instead of assuming a single server/browser timezone (section 32).
    timezone: { type: String, default: 'UTC' },

    // Admin-defined custom fields beyond the standard set above
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Partner', partnerSchema);

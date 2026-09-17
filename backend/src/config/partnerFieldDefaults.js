// Default FieldDefinition rows for the standard Channel Partner Registration
// field set. Seeded once (see fieldDefinitionService.ensureBaseFields);
// admins can enable/disable/require any of these afterwards, and add
// entirely new (isCustom) fields on top via the admin portal.

let order = 0;
const row = (fieldKey, label, group, overrides = {}) => ({
  fieldKey,
  label,
  group,
  dataType: 'TEXT',
  isRequired: false,
  isEnabled: true,
  isSystemGenerated: false,
  isCustom: false,
  sortOrder: order++,
  ...overrides
});

const BASE_FIELD_DEFINITIONS = [
  // Core (mandatory)
  row('name', 'Channel Partner Name', 'Core', { isRequired: true }),
  row('mobile', 'Mobile Number', 'Core', { isRequired: true }),
  row('email', 'Email', 'Core', { isRequired: true }),
  row('username', 'Username', 'Core', { isRequired: true }),
  row('password', 'Password', 'Core', { isRequired: true }),

  // Profile
  row('partnerType', 'Partner Type', 'Profile', { dataType: 'SELECT', options: ['Individual', 'Company', 'Agency'] }),
  row('companyName', 'Company / Organisation Name', 'Profile'),
  row('contactPersonName', 'Contact Person Name', 'Profile'),
  row('alternateMobile', 'Alternate Mobile Number', 'Profile'),
  row('alternateEmail', 'Alternate Email', 'Profile'),
  row('website', 'Website', 'Profile'),

  // Address
  row('address', 'Address', 'Address'),
  row('addressLine2', 'Address Line 2', 'Address'),
  row('city', 'City', 'Address'),
  row('state', 'State', 'Address'),
  row('country', 'Country', 'Address'),
  row('pinCode', 'PIN Code', 'Address'),

  // KYC
  row('panNumber', 'PAN Number', 'KYC'),
  row('gstin', 'GSTIN', 'KYC'),
  row('reraRegistrationNumber', 'RERA Registration Number', 'KYC'),
  row('reraState', 'RERA State', 'KYC'),
  row('reraExpiryDate', 'RERA Expiry Date', 'KYC', { dataType: 'DATE' }),

  // Documents (URL references - see spec section 30 for the file-upload note)
  row('panDocumentUrl', 'PAN Document (URL)', 'Documents'),
  row('gstCertificateUrl', 'GST Certificate (URL)', 'Documents'),
  row('reraCertificateUrl', 'RERA Certificate (URL)', 'Documents'),
  row('addressProofUrl', 'Address Proof (URL)', 'Documents'),

  // Banking
  row('bankAccountHolderName', 'Bank Account Holder Name', 'Banking'),
  row('bankName', 'Bank Name', 'Banking'),
  row('accountNumber', 'Account Number', 'Banking'),
  row('ifscCode', 'IFSC Code', 'Banking'),
  row('accountType', 'Account Type', 'Banking', { dataType: 'SELECT', options: ['Current', 'Savings'] }),

  // Business profile
  row('partnerSource', 'Partner Source', 'Business', { dataType: 'SELECT', options: ['Direct', 'Referral', 'Existing'] }),
  row('referredBy', 'Referred By', 'Business'),
  row('relationshipManager', 'Relationship Manager', 'Business'),
  row('partnerCategory', 'Partner Category', 'Business', { dataType: 'SELECT', options: ['Broker', 'Agency', 'Referral'] }),
  row('operatingCities', 'Operating Cities', 'Business', { dataType: 'LIST' }),
  row('operatingStates', 'Operating States', 'Business', { dataType: 'LIST' }),
  row('yearsOfExperience', 'Years of Experience', 'Business', { dataType: 'NUMBER' }),
  row('numberOfSalesAgents', 'Number of Sales Agents', 'Business', { dataType: 'NUMBER' }),

  // Integration
  row('crmName', 'CRM Name', 'Integration'),
  row('externalPartnerId', "Partner's External CRM ID", 'Integration'),
  row('integrationType', 'Integration Type', 'Integration', { dataType: 'SELECT', options: ['API', 'Webhook', 'Manual'] }),

  // Agreement
  row('agreementNumber', 'Agreement Number', 'Agreement'),
  row('agreementStartDate', 'Agreement Start Date', 'Agreement', { dataType: 'DATE' }),
  row('agreementExpiryDate', 'Agreement Expiry Date', 'Agreement', { dataType: 'DATE' }),

  // Commission
  row('commissionPlan', 'Commission Plan', 'Commission'),
  row('commissionType', 'Commission Type', 'Commission', { dataType: 'SELECT', options: ['Percentage', 'Fixed'] }),
  row('commissionRate', 'Commission Rate', 'Commission', { dataType: 'NUMBER' }),

  row('notes', 'Notes', 'Other', { dataType: 'TEXTAREA' }),

  // System-generated - shown read-only, never rendered as an editable input
  row('partnerId', 'Partner ID', 'System', { isSystemGenerated: true }),
  row('partnerCode', 'Partner Code', 'System', { isSystemGenerated: true }),
  row('status', 'Status', 'System', { isSystemGenerated: true }),
  row('kycStatus', 'KYC Status', 'System', { isSystemGenerated: true }),
  row('approvalStatus', 'Approval Status', 'System', { isSystemGenerated: true }),
  row('createdBy', 'Created By', 'System', { isSystemGenerated: true }),
  row('lastLoginAt', 'Last Login', 'System', { isSystemGenerated: true })
];

module.exports = { BASE_FIELD_DEFINITIONS };

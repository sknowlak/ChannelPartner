// Default LeadFieldDefinition rows for the real-estate lead form (section
// 33's field set, made admin-configurable in section 36, expanded to match
// the full Leadrat "Add Lead" field set in section 39). Seeded once per
// partner; `scope` tells the backend where to read/write the value:
//   'customer'     -> Customer.<fieldKey>
//   'registration' -> Registration.<fieldKey> (a real schema column)
//   'custom'       -> Registration.customFields.<fieldKey> (a Mixed map entry)
// Custom fields added later via the Settings page also use scope 'custom'
// but are marked isCustom: true so they can be deleted; every field below
// is part of the base set (isCustom: false) and can only be enabled/disabled
// or required/optional, never deleted.
//
// Groups map 1:1 to the tabs on the Add/Edit Lead form: Lead Info, Enquiry
// Info, Additional Info, Others, Notes.

let order = 0;
const row = (fieldKey, label, group, scope, overrides = {}) => ({
  fieldKey,
  label,
  group,
  scope,
  dataType: 'TEXT',
  options: [],
  isRequired: false,
  isEnabled: true,
  isCore: false,
  isCustom: false,
  sortOrder: order++,
  ...overrides
});

const BASE_LEAD_FIELD_DEFINITIONS = [
  // --- Lead Info ---
  // Core - always present, always required, cannot be disabled (section 33: "only name and number mandatory")
  row('name', 'Name', 'Lead Info', 'customer', { isRequired: true, isCore: true }),
  row('mobile', 'Primary Number', 'Lead Info', 'customer', { isRequired: true, isCore: true }),

  row('alternateMobile', 'Alternate Number', 'Lead Info', 'customer'),
  row('landline', 'Landline Number', 'Lead Info', 'custom'),
  row('email', 'Email', 'Lead Info', 'customer'),
  row('referralName', 'Referral Name', 'Lead Info', 'custom'),
  row('referralPhone', 'Referral Phone No', 'Lead Info', 'custom'),
  row('referralEmail', 'Referral Email', 'Lead Info', 'custom'),
  row('leadSource', 'Source', 'Lead Info', 'registration', {
    dataType: 'SELECT',
    options: ['Direct', 'Referral', 'Website', 'Property Portal', 'Social Media', 'Walk-in', 'Cold Call', 'Other']
  }),
  row('subSource', 'Sub-Source', 'Lead Info', 'custom'),
  row('primaryOwner', 'Primary Owner', 'Lead Info', 'custom'),
  row('secondaryOwner', 'Secondary Owner', 'Lead Info', 'custom'),
  row('customerLocation', 'Customer Location', 'Lead Info', 'custom'),

  // --- Enquiry Info ---
  row('budgetMin', 'Min. Budget', 'Enquiry Info', 'registration', { dataType: 'CURRENCY' }),
  row('budgetMax', 'Max. Budget', 'Enquiry Info', 'registration', { dataType: 'CURRENCY' }),
  row('carpetArea', 'Carpet Area (Sq. Feet)', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('builtUpArea', 'Built-up Area (Sq. Feet)', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('saleableArea', 'Saleable Area (Sq. Feet)', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('propertyArea', 'Property Area (Sq. Feet)', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('netArea', 'Net Area (Sq. Feet)', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('unitNumber', 'Unit Number/Name', 'Enquiry Info', 'custom'),
  row('clusterName', 'Cluster Name', 'Enquiry Info', 'custom'),
  row('purpose', 'Purpose', 'Enquiry Info', 'custom', { dataType: 'SELECT', options: ['Self Use', 'Investment', 'Resale'] }),
  row('buyerType', 'Buyer', 'Enquiry Info', 'custom', { dataType: 'SELECT', options: ['First Time', 'Repeat', 'Investor'] }),
  row('downPaymentPercent', 'Payment Plan - Down Payment %', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('balancePaymentPercent', 'Payment Plan - Balance %', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('requirementType', 'Enquired For', 'Enquiry Info', 'registration', { dataType: 'SELECT', options: ['Buy', 'Rent', 'Sell'] }),
  row('propertyType', 'Property Type', 'Enquiry Info', 'registration', {
    dataType: 'SELECT', options: ['Apartment', 'Villa', 'Plot', 'Commercial', 'Office', 'Other']
  }),
  row('propertySubType', 'Property Sub-Type', 'Enquiry Info', 'custom', {
    dataType: 'SELECT', options: ['Flat', 'Villa', 'Plot', 'Office', 'Shop', 'Other'], isRequired: true
  }),
  row('baths', 'Baths', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('beds', 'Beds', 'Enquiry Info', 'custom', { dataType: 'NUMBER' }),
  row('preferredFloors', 'Preferred Floor(s)', 'Enquiry Info', 'custom'),
  row('furnishStatus', 'Furnish Status', 'Enquiry Info', 'custom', {
    dataType: 'SELECT', options: ['Furnished', 'Semi-Furnished', 'Unfurnished']
  }),
  row('projectId', 'Project(s)', 'Enquiry Info', 'registration'),
  row('propertyNames', 'Property(s)', 'Enquiry Info', 'custom', { dataType: 'LIST' }),
  row('offeringType', 'Offering Type', 'Enquiry Info', 'custom', {
    dataType: 'SELECT', options: ['Ready', 'Under Construction', 'Resale']
  }),
  row('agencyNames', 'Agency Name(s)', 'Enquiry Info', 'custom', { dataType: 'LIST' }),
  row('campaignNames', 'Campaign Name(s)', 'Enquiry Info', 'custom', { dataType: 'LIST' }),
  row('channelPartnerNames', 'Channel Partner Name(s)', 'Enquiry Info', 'custom', { dataType: 'LIST' }),
  row('possessionTimeline', 'Possession Needed By', 'Enquiry Info', 'registration', {
    dataType: 'SELECT', options: ['Immediate', '0-3 Months', '3-6 Months', '6-12 Months', '1 Year+']
  }),
  row('preferredLocation', 'Enquired Location', 'Enquiry Info', 'registration'),

  // --- Additional Info ---
  row('profession', 'Profession', 'Additional Info', 'custom', {
    dataType: 'SELECT', options: ['Business', 'Salaried', 'Self-Employed', 'Other']
  }),
  row('companyName', 'Company Name', 'Additional Info', 'custom'),
  row('designation', 'Designation', 'Additional Info', 'custom'),
  row('nationality', 'Nationality', 'Additional Info', 'custom'),
  row('gender', 'Gender', 'Additional Info', 'custom', { dataType: 'SELECT', options: ['Male', 'Female', 'Other'] }),
  row('dob', 'Date of Birth', 'Additional Info', 'custom', { dataType: 'DATE' }),
  row('maritalStatus', 'Marital Status', 'Additional Info', 'custom', {
    dataType: 'SELECT', options: ['Single', 'Married', 'Divorced', 'Widowed']
  }),
  row('anniversaryDate', 'Anniversary Date', 'Additional Info', 'custom', { dataType: 'DATE' }),

  // --- Others ---
  row('sourcingManager', 'Sourcing Manager', 'Others', 'custom'),
  row('closingManager', 'Closing Manager', 'Others', 'custom'),
  row('externalReferenceId', 'External CRM Reference', 'Others', 'registration'),

  // Marketing attribution + external-integration passthrough fields (section
  // 46) - added specifically so partner-configured outbound webhooks (e.g.
  // pushing to connect.leadrat.com's own integration API) have somewhere to
  // read these from, since the receiving system's schema expects them.
  row('utmSource', 'UTM Source', 'Others', 'custom'),
  row('utmMedium', 'UTM Medium', 'Others', 'custom'),
  row('utmCampaign', 'UTM Campaign', 'Others', 'custom'),
  row('utmContent', 'UTM Content', 'Others', 'custom'),
  row('utmTerm', 'UTM Term', 'Others', 'custom'),
  row('utmUrl', 'UTM URL', 'Others', 'custom'),
  row('utmId', 'UTM ID', 'Others', 'custom'),
  row('callRecordingUrl', 'Call Recording URL', 'Others', 'custom'),
  row('scheduledCallbackDate', 'Scheduled Callback Date', 'Others', 'custom', { dataType: 'DATE' }),
  row('scheduledCallbackTime', 'Scheduled Callback Time', 'Others', 'custom'),
  row('channelPartnerMobile', 'Channel Partner Mobile', 'Others', 'custom'),
  row('channelPartnerEmail', 'Channel Partner Email', 'Others', 'custom'),
  row('additionalProperties', 'Additional Properties', 'Others', 'custom'),

  // --- Notes ---
  row('notes', 'Notes', 'Notes', 'registration', { dataType: 'TEXTAREA', isRequired: true })
];

module.exports = { BASE_LEAD_FIELD_DEFINITIONS };

// Every standard Partner field a caller may filter by (query param = field
// name), plus custom fields via `cf_<key>`. Excludes passwordHash and
// internal bookkeeping fields.
const TEXT_FIELDS = [
  'partnerId', 'partnerCode', 'name', 'mobile', 'email', 'username',
  'partnerType', 'companyName', 'contactPersonName', 'alternateMobile', 'alternateEmail', 'website',
  'address', 'addressLine2', 'city', 'state', 'country', 'pinCode',
  'panNumber', 'gstin', 'reraRegistrationNumber', 'reraState',
  'bankAccountHolderName', 'bankName', 'accountNumber', 'ifscCode', 'accountType',
  'partnerSource', 'referredBy', 'relationshipManager', 'partnerCategory',
  'crmName', 'externalPartnerId', 'integrationType',
  'agreementNumber', 'commissionPlan', 'commissionType',
  'status', 'kycStatus', 'approvalStatus', 'createdBy'
];

const EXACT_MATCH_FIELDS = new Set(['partnerId', 'partnerCode', 'status', 'kycStatus', 'approvalStatus']);

// Builds a Mongo filter from admin list query params: exact match on
// enum-like fields, case-insensitive partial match on free text, a
// createdFrom/createdTo/updatedFrom/updatedTo date range, and cf_<key>
// exact-match lookups against customFields.
function buildPartnerFilter(query) {
  const filter = {};

  for (const field of TEXT_FIELDS) {
    const value = query[field];
    if (value === undefined || value === '') continue;
    filter[field] = EXACT_MATCH_FIELDS.has(field) ? value : { $regex: value, $options: 'i' };
  }

  if (query.createdFrom || query.createdTo) {
    filter.createdAt = {};
    if (query.createdFrom) filter.createdAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) filter.createdAt.$lte = new Date(query.createdTo);
  }

  if (query.updatedFrom || query.updatedTo) {
    filter.updatedAt = {};
    if (query.updatedFrom) filter.updatedAt.$gte = new Date(query.updatedFrom);
    if (query.updatedTo) filter.updatedAt.$lte = new Date(query.updatedTo);
  }

  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('cf_') && value !== '') {
      filter[`customFields.${key.slice(3)}`] = value;
    }
  }

  return filter;
}

module.exports = { buildPartnerFilter, TEXT_FIELDS };

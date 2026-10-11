// Client-side mirror of webhookService.js's renderTemplate/flattenForForm
// (section 45) - lets the Integrations settings page show "here's what
// will actually be sent" live, as the partner types their Custom template,
// without a round-trip to the server. Values are fake but the STRUCTURE and
// substitution behavior are identical to what a real send does.
export const SAMPLE_LEAD_PAYLOAD = {
  event: 'LEAD_CREATED',
  timestamp: new Date().toISOString(),
  registrationId: 'REG-10123',
  projectId: 'Prestige Lakeside',
  stage: 'Registered',
  isBooked: false,
  requirementType: 'Buy',
  propertyType: 'Villa',
  bhk: '2 BHK',
  budgetMin: 5000000,
  budgetMax: 7500000,
  preferredLocation: 'Bellandur, Bengaluru, Karnataka',
  possessionTimeline: '0-3 Months',
  leadSource: 'Website',
  notes: 'Interested in a corner unit with vaastu compliance.',
  customFields: {
    carpetArea: 1200, builtUpArea: 1300, saleableArea: 1400, propertyArea: 1500, netArea: 1150,
    unitNumber: '101', clusterName: 'Cluster A', purpose: 'Self Use', buyerType: 'Investor',
    downPaymentPercent: 20, balancePaymentPercent: 80, propertySubType: 'Flat', baths: 2, beds: 2,
    preferredFloors: '2', furnishStatus: 'Furnished', propertyNames: ['Lakeside Tower A'], offeringType: 'Ready',
    agencyNames: ['Prime Agency'], campaignNames: ['Diwali Campaign'], channelPartnerNames: ['Sunrise Realty'],
    landline: '08041234567', referralName: 'Ravi Kumar', referralPhone: '+916677889900', referralEmail: 'ravi@example.com',
    subSource: 'Google Ads', primaryOwner: 'ALPHA', secondaryOwner: 'BETA', customerLocation: 'HSR Layout, Bengaluru, Karnataka',
    utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'diwali'
  },
  customer: { name: 'Aarav Sharma', mobile: '+919876543210', countryCode: '+91', nationalNumber: '9876543210', email: 'aarav.sharma@example.com', alternateMobile: '+919123456780' },
  partner: { name: 'Sunrise Realty', mobile: '+919000012345', email: 'contact@sunriserealty.example', companyName: 'Sunrise Realty Pvt Ltd' }
};

function lookupPath(payload, path) {
  const value = path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), payload);
  if (value === undefined || value === null || value === '') return null;
  return Array.isArray(value) ? value.join(',') : String(value);
}

// `json: true` mirrors the backend: values are JSON-escaped, and a
// placeholder that is the whole quoted value becomes null when empty.
export function renderTemplate(template, payload, { json = false } = {}) {
  let out = template;
  if (json) {
    out = out.replace(/"\{\{\s*([\w.]+)\s*\}\}"/g, (_, path) => JSON.stringify(lookupPath(payload, path)));
  }
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = lookupPath(payload, path) ?? '';
    return json ? JSON.stringify(value).slice(1, -1) : value;
  });
}

// Same rule as webhookService.js's buildRequest: a Custom body is JSON
// unless the partner's headers set a non-JSON Content-Type.
function isJsonContentType(headersText) {
  try {
    const headers = JSON.parse(headersText || '{}');
    const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
    return key ? /json/i.test(String(headers[key])) : true;
  } catch {
    return true;
  }
}

function flattenForForm(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) out.push(...flattenForForm(value, flatKey));
    else out.push([flatKey, Array.isArray(value) ? value.join(',') : String(value ?? '')]);
  }
  return out;
}

export function buildPreviewBody(format, bodyTemplate, headersText) {
  if (format === 'FORM') {
    return flattenForForm(SAMPLE_LEAD_PAYLOAD).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }
  if (format === 'CUSTOM') {
    return bodyTemplate ? renderTemplate(bodyTemplate, SAMPLE_LEAD_PAYLOAD, { json: isJsonContentType(headersText) }) : '(write a body template above to see a preview)';
  }
  return JSON.stringify(SAMPLE_LEAD_PAYLOAD, null, 2);
}

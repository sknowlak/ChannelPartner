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
  propertyType: 'Apartment',
  bhk: '2 BHK',
  budgetMin: 5000000,
  budgetMax: 7500000,
  preferredLocation: 'HSR Layout, Bengaluru',
  possessionTimeline: '6-12 Months',
  leadSource: 'Direct',
  notes: 'Interested in a corner unit with vaastu compliance.',
  customFields: { propertySubType: 'Flat', beds: 2, baths: 2 },
  customer: { name: 'Aarav Sharma', mobile: '9876543210', email: 'aarav.sharma@example.com', alternateMobile: '9123456780' }
};

export function renderTemplate(template, payload) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), payload);
    if (value === undefined || value === null) return '';
    return Array.isArray(value) ? value.join(',') : String(value);
  });
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

export function buildPreviewBody(format, bodyTemplate) {
  if (format === 'FORM') {
    return flattenForForm(SAMPLE_LEAD_PAYLOAD).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }
  if (format === 'CUSTOM') {
    return bodyTemplate ? renderTemplate(bodyTemplate, SAMPLE_LEAD_PAYLOAD) : '(write a body template above to see a preview)';
  }
  return JSON.stringify(SAMPLE_LEAD_PAYLOAD, null, 2);
}

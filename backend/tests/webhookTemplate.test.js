const { renderTemplate } = require('../src/services/webhookService');

// Custom-format webhook bodies (section 46) - a client CRM's cURL --data
// body with {{placeholders}} filled from the lead at send time.
const payload = {
  registrationId: 'REG-1',
  budgetMax: 7500000,
  notes: 'Wants "corner" unit\nCall after 6pm',
  customFields: { propertyNames: ['Tower A', 'Tower B'] },
  customer: { name: 'SK NOWLAK', mobile: '+915671162648', email: '' },
  partner: { name: 'ABC Realty' }
};

describe('renderTemplate (JSON mode)', () => {
  const template = '{"Name":"{{customer.name}}","Email":"{{customer.email}}","City":"{{city}}","Notes":"{{notes}}","Budget":"{{budgetMax}}","Property":"{{customFields.propertyNames}}","Ref":"CP-{{registrationId}}","LeadSource":41}';

  test('produces valid JSON even when values contain quotes and newlines', () => {
    const body = JSON.parse(renderTemplate(template, payload, { json: true }));
    expect(body.Name).toBe('SK NOWLAK');
    expect(body.Notes).toBe(payload.notes);
    expect(body.LeadSource).toBe(41);
  });

  test('a whole-value placeholder with no data becomes null', () => {
    const body = JSON.parse(renderTemplate(template, payload, { json: true }));
    expect(body.Email).toBeNull();
    expect(body.City).toBeNull();
  });

  test('numbers stay strings, lists are comma-joined, inline placeholders interpolate', () => {
    const body = JSON.parse(renderTemplate(template, payload, { json: true }));
    expect(body.Budget).toBe('7500000');
    expect(body.Property).toBe('Tower A,Tower B');
    expect(body.Ref).toBe('CP-REG-1');
  });
});

describe('renderTemplate (non-JSON mode)', () => {
  test('substitutes raw values and empty string for missing', () => {
    expect(renderTemplate('name={{customer.name}}&email={{customer.email}}', payload)).toBe('name=SK NOWLAK&email=');
  });
});

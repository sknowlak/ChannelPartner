import { describe, expect, test } from 'vitest';
import { bodyFromRows, parseCurl, parseTemplateObject, rowsFromBody, suggestRows } from './curlMapping';

const LEADRAT_CURL = `curl --location 'https://connect.leadrat.com/api/v1/integration/Webhook/amazon/abc123' \\
--header 'API-Key: secret-key' \\
--header 'Content-Type: application/json' \\
--data-raw '{
    "Name": "SK NOWLAK",
    "City": null,
    "ChannelPartnerName": null,
    "Notes": "Leadrat, 1",
    "Email": "nowlaksk@gmail.com",
    "Mobile": "+915671162648",
    "LeadSource": 41,
    "AccountId": "00000000-0000-0000-0000-000000000000",
    "UtmSource": null,
    "ReferenceId": null
}
'`;

const FIELDS = [
  { path: 'customer.name', label: 'Name' },
  { path: 'customer.mobile', label: 'Primary Number' },
  { path: 'customer.email', label: 'Email' },
  { path: 'notes', label: 'Notes' },
  { path: 'leadSource', label: 'Source' },
  { path: 'customFields.utmSource', label: 'UTM Source' },
  { path: 'registrationId', label: 'Registration ID' },
  { path: 'partner.name', label: 'Partner Name' }
];

describe('parseCurl', () => {
  test('extracts URL, method, headers and body from a copied Postman cURL', () => {
    const parsed = parseCurl(LEADRAT_CURL);
    expect(parsed.url).toBe('https://connect.leadrat.com/api/v1/integration/Webhook/amazon/abc123');
    expect(parsed.method).toBe('POST');
    expect(parsed.name).toBe('connect.leadrat.com');
    expect(parsed.headers).toEqual({ 'API-Key': 'secret-key', 'Content-Type': 'application/json' });
    expect(JSON.parse(parsed.body).Name).toBe('SK NOWLAK');
  });

  test('handles -X, double quotes and escaped quotes', () => {
    const parsed = parseCurl('curl -X PUT "https://x.example/hook" -H "Authorization: Bearer t" -d "{\\"a\\":1}"');
    expect(parsed.method).toBe('PUT');
    expect(parsed.headers.Authorization).toBe('Bearer t');
    expect(parsed.body).toBe('{"a":1}');
  });

  test('rejects input that is not a cURL command', () => {
    expect(() => parseCurl('wget https://x.example')).toThrow(/starts with "curl"/);
  });
});

describe('suggestRows', () => {
  const body = JSON.parse(parseCurl(LEADRAT_CURL).body);
  const rows = suggestRows(body, FIELDS);
  const byKey = Object.fromEntries(rows.map((r) => [r.path.join('.'), r]));

  test('maps example data and null keys to matching lead fields', () => {
    expect(byKey.Name).toMatchObject({ kind: 'FIELD', field: 'customer.name' });
    expect(byKey.Mobile).toMatchObject({ kind: 'FIELD', field: 'customer.mobile' });
    expect(byKey.Notes).toMatchObject({ kind: 'FIELD', field: 'notes' });
    expect(byKey.ChannelPartnerName).toMatchObject({ kind: 'FIELD', field: 'partner.name' });
    expect(byKey.UtmSource).toMatchObject({ kind: 'FIELD', field: 'customFields.utmSource' });
    expect(byKey.ReferenceId).toMatchObject({ kind: 'FIELD', field: 'registrationId' });
  });

  test('keeps client constants and unmatched nulls as they were', () => {
    expect(byKey.LeadSource).toMatchObject({ kind: 'FIXED', value: 41 });
    expect(byKey.AccountId).toMatchObject({ kind: 'FIXED', value: '00000000-0000-0000-0000-000000000000' });
    expect(byKey.City).toMatchObject({ kind: 'NULL' });
  });

  test('round-trips through a template: body -> rows -> body -> rows', () => {
    const template = JSON.stringify(bodyFromRows(body, rows));
    const reparsed = parseTemplateObject(template);
    expect(reparsed.Name).toBe('{{customer.name}}');
    expect(reparsed.LeadSource).toBe(41);
    expect(reparsed.City).toBeNull();
    expect(rowsFromBody(reparsed)).toEqual(rows);
  });
});

describe('nested bodies', () => {
  test('walks nested objects and writes back at the same path', () => {
    const body = { lead: { name: 'x', phone: null }, tags: ['a'] };
    const rows = suggestRows(body, FIELDS);
    expect(rows.map((r) => r.path.join('.'))).toEqual(['lead.name', 'lead.phone', 'tags']);
    expect(bodyFromRows(body, rows)).toEqual({ lead: { name: '{{customer.name}}', phone: '{{customer.mobile}}' }, tags: ['a'] });
  });
});

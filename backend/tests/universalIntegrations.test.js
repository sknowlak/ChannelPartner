// Unit tests for the universal integration building blocks (spec section 51).
const crypto = require('crypto');
const { getPath, listPaths } = require('../src/utils/jsonPath');
const { sanitizeAuth, maskAuth, applyAuth, verifyHmac } = require('../src/services/httpAuthService');
const { mapRecord, extractRecords } = require('../src/services/leadImportService');
const { renderUrl } = require('../src/services/webhookService');

describe('jsonPath', () => {
  const doc = { data: { id: 7 }, field_data: [{ name: 'phone', values: ['98'] }], items: [{ a: 1 }] };
  test('dotted and bracketed paths', () => {
    expect(getPath(doc, 'data.id')).toBe(7);
    expect(getPath(doc, 'field_data.0.values.0')).toBe('98');
    expect(getPath(doc, 'field_data[0].values[0]')).toBe('98');
    expect(getPath(doc, 'missing.path')).toBeUndefined();
  });
  test('prototype keys are never walked', () => {
    expect(getPath({}, '__proto__.polluted')).toBeUndefined();
    expect(getPath({}, 'constructor')).toBeUndefined();
  });
  test('listPaths gives leaf paths with samples', () => {
    expect(listPaths(doc).map((p) => p.path)).toEqual(['data.id', 'field_data.0.name', 'field_data.0.values.0', 'items.0.a']);
  });
});

describe('connection auth', () => {
  test('masked secrets come back unchanged; new secrets replace old', () => {
    const stored = sanitizeAuth({ type: 'OAUTH2', tokenUrl: 'https://a/t', clientId: 'c', clientSecret: 'super-secret-1' });
    const masked = maskAuth(stored);
    expect(masked.clientSecret).toBe('••••et-1');
    expect(sanitizeAuth(masked, stored).clientSecret).toBe('super-secret-1');
    expect(sanitizeAuth({ ...masked, clientSecret: 'new' }, stored).clientSecret).toBe('new');
  });
  test('unknown type falls back to NONE', () => {
    expect(sanitizeAuth({ type: 'MAGIC' }).type).toBe('NONE');
  });
  test('basic, bearer, header key, query key', async () => {
    const basic = await applyAuth({ type: 'BASIC', username: 'u', password: 'p' }, { url: 'https://x/y', headers: {} });
    expect(basic.headers.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    const bearer = await applyAuth({ type: 'BEARER', token: 't' }, { url: 'https://x/y' });
    expect(bearer.headers.Authorization).toBe('Bearer t');
    const header = await applyAuth({ type: 'API_KEY', keyName: 'API-Key', keyValue: 'k', keyIn: 'HEADER' }, { url: 'https://x/y' });
    expect(header.headers['API-Key']).toBe('k');
    const query = await applyAuth({ type: 'API_KEY', keyName: 'key', keyValue: 'k v', keyIn: 'QUERY' }, { url: 'https://x/y?a=1' });
    expect(query.url).toBe('https://x/y?a=1&key=k+v');
  });
  test('HMAC signs the body and verifies it in constant time', async () => {
    const auth = { type: 'HMAC', secret: 's', signatureHeader: 'X-Sig', algorithm: 'sha256', encoding: 'hex', signaturePrefix: 'sha256=' };
    const out = await applyAuth(auth, { url: 'https://x', body: '{"a":1}' });
    const expected = `sha256=${crypto.createHmac('sha256', 's').update('{"a":1}').digest('hex')}`;
    expect(out.headers['X-Sig']).toBe(expected);
    expect(verifyHmac(auth, Buffer.from('{"a":1}'), expected)).toBe(true);
    expect(verifyHmac(auth, Buffer.from('{"a":2}'), expected)).toBe(false);
    expect(verifyHmac(auth, Buffer.from('{"a":1}'), undefined)).toBe(false);
  });
});

describe('record mapping (receive / pull)', () => {
  const defs = {
    name: { fieldKey: 'name', label: 'Name', scope: 'customer', dataType: 'TEXT' },
    mobile: { fieldKey: 'mobile', label: 'Mobile', scope: 'customer', dataType: 'TEXT' },
    leadSource: { fieldKey: 'leadSource', label: 'Source', scope: 'registration', dataType: 'SELECT', options: ['Social Media', 'Website'] },
    propertyNames: { fieldKey: 'propertyNames', label: 'Property(s)', scope: 'custom', dataType: 'LIST' },
    notes: { fieldKey: 'notes', label: 'Notes', scope: 'registration', dataType: 'TEXTAREA' }
  };
  const source = {
    mapping: [
      { fieldKey: 'name', source: 'PATH', path: 'person.full_name' },
      { fieldKey: 'mobile', source: 'PATH', path: 'person.phone' },
      { fieldKey: 'leadSource', source: 'PATH', path: 'channel' },
      { fieldKey: 'propertyNames', source: 'PATH', path: 'projects' },
      { fieldKey: 'notes', source: 'PATH', path: 'tags' },
      { fieldKey: 'stage', source: 'PATH', path: 'status' }
    ],
    statusMap: [{ from: 'QUALIFIED', to: 'Site Visit' }]
  };
  const record = { person: { full_name: 'A', phone: '98' }, channel: 'social_media', projects: ['T1', 'T2'], tags: ['x', 'y'], status: 'qualified' };

  test('fields land in customer / registration buckets; lists and dropdowns shaped', () => {
    const out = mapRecord(source, record, defs);
    expect(out.customer).toEqual({ name: 'A', mobile: '98' });
    expect(out.fields.leadSource).toBe('Social Media'); // matched ignoring case/underscores
    expect(out.fields.propertyNames).toEqual(['T1', 'T2']); // LIST stays a list
    expect(out.fields.notes).toBe('x, y'); // lists into text fields are joined
    expect(out.stage).toBe('Site Visit'); // status map, case-insensitive
  });
  test('a dropdown value with no matching option is dropped with a warning', () => {
    const out = mapRecord(source, { ...record, channel: 'Billboard' }, defs);
    expect(out.fields.leadSource).toBeUndefined();
    expect(out.warnings[0]).toMatch(/Billboard/);
  });
  test('records are found by path, as an array, or as a single object', () => {
    expect(extractRecords({ recordsPath: 'data.items' }, { data: { items: [1, 2] } })).toEqual([1, 2]);
    expect(extractRecords({}, [{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(extractRecords({}, { a: 1 })).toEqual([{ a: 1 }]);
  });
});

describe('URL templates', () => {
  test('placeholders in URLs are URL-encoded', () => {
    expect(renderUrl('https://x/leads/{{external.id}}?q={{customer.name}}', { external: { id: 'A/1' }, customer: { name: 'J D' } }))
      .toBe('https://x/leads/A%2F1?q=J%20D');
  });
});

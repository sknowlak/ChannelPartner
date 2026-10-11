// Unit tests for the loophole fixes in spec section 50 - pure helpers only,
// no database needed.
const { normalizeEmail, isValidEmail } = require('../src/utils/email');
const { isBlockedAddress, urlShapeProblem, outboundUrlProblem } = require('../src/utils/outboundUrl');
const { clean } = require('../src/middleware/stripOperators');
const { fieldValueProblem } = require('../src/utils/fieldValues');
const { renderTemplate } = require('../src/services/webhookService');
const { maskHeaders, redactHeaders, restoreRedacted, headersProblem, REDACTED } = require('../src/utils/secretHeaders');
const { escapeRegex } = require('../src/utils/partnerFilter');
const { passwordProblem, issuedBeforePasswordChange } = require('../src/services/partnerAuthService');

describe('email normalization (duplicate matching)', () => {
  test('case, whitespace and +tags collapse to one key', () => {
    expect(normalizeEmail('  Victim@Example.com ')).toBe('victim@example.com');
    expect(normalizeEmail('victim+promo@example.com')).toBe('victim@example.com');
  });
  test('gmail dots and googlemail alias collapse', () => {
    expect(normalizeEmail('V.i.c.tim@googlemail.com')).toBe('victim@gmail.com');
  });
  test('validation', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail({ $ne: null })).toBe(false);
  });
});

describe('outbound URL guard (SSRF)', () => {
  test.each(['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', '::ffff:127.0.0.1', 'fd00::1'])(
    'blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true)
  );
  test.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));

  test('only http(s), no credentials in the URL', () => {
    expect(urlShapeProblem('file:///etc/passwd')).toMatch(/http/);
    expect(urlShapeProblem('gopher://x')).toMatch(/http/);
    expect(urlShapeProblem('https://user:pw@example.com')).toMatch(/credentials/);
    expect(urlShapeProblem('https://example.com/hook')).toBeNull();
  });

  test('literal internal addresses and localhost are refused without DNS', async () => {
    expect(await outboundUrlProblem('http://169.254.169.254/latest/meta-data/')).toMatch(/public/);
    expect(await outboundUrlProblem('http://localhost:27017')).toMatch(/public/);
    expect(await outboundUrlProblem('http://[::1]:5000/')).toMatch(/public/);
  });
});

describe('operator stripping (NoSQL injection)', () => {
  test('removes $-keys at any depth and prototype keys', () => {
    const body = JSON.parse('{"customer":{"email":{"$regex":"^a"}},"projectId":{"$ne":null},"ok":"x","__proto__":{"polluted":1}}');
    clean(body);
    expect(body).toEqual({ customer: { email: {} }, projectId: {}, ok: 'x' });
    expect({}.polluted).toBeUndefined();
  });
});

describe('lead field value validation', () => {
  const def = (dataType, extra = {}) => ({ fieldKey: 'f', label: 'Field', dataType, ...extra });
  test('rejects objects and wrong types', () => {
    expect(fieldValueProblem(def('TEXT'), { nested: true })).toBeTruthy();
    expect(fieldValueProblem(def('NUMBER'), 'abc')).toBeTruthy();
    expect(fieldValueProblem(def('DATE'), 'not a date')).toBeTruthy();
  });
  test('SELECT must be one of the options', () => {
    expect(fieldValueProblem(def('SELECT', { options: ['Buy', 'Rent'] }), 'Steal')).toBeTruthy();
    expect(fieldValueProblem(def('SELECT', { options: ['Buy', 'Rent'] }), 'Buy')).toBeNull();
  });
  test('size limits', () => {
    expect(fieldValueProblem(def('TEXT'), 'x'.repeat(1001))).toBeTruthy();
    expect(fieldValueProblem(def('LIST'), Array(101).fill('a'))).toBeTruthy();
  });
  test('empty values pass (required is checked elsewhere)', () => {
    expect(fieldValueProblem(def('NUMBER'), '')).toBeNull();
  });
});

describe('webhook template escaping for form and XML bodies', () => {
  const payload = { notes: 'x&stage=Booked', customer: { name: '</Name><Status>Booked' } };
  test('form values are URL-encoded', () => {
    expect(renderTemplate('notes={{notes}}', payload, { escape: 'form' })).toBe('notes=x%26stage%3DBooked');
  });
  test('xml values are entity-escaped', () => {
    expect(renderTemplate('<Name>{{customer.name}}</Name>', payload, { escape: 'xml' }))
      .toBe('<Name>&lt;/Name&gt;&lt;Status&gt;Booked</Name>');
  });
});

describe('webhook header secrets', () => {
  const headers = { Authorization: 'Bearer abcdefgh12345678', 'X-Api-Key': 'k-1234567890', 'Content-Type': 'application/json' };
  test('masked for display, redacted for storage, restored for retry', () => {
    const masked = maskHeaders(headers);
    expect(masked.Authorization).toBe('••••5678');
    expect(masked['Content-Type']).toBe('application/json');
    const stored = redactHeaders(headers);
    expect(stored.Authorization).toBe(REDACTED);
    expect(restoreRedacted(stored, headers)).toEqual(headers);
  });
  test('header injection and bad shapes are refused', () => {
    expect(headersProblem({ 'X-A': 'ok\r\nX-Evil: 1' })).toBeTruthy();
    expect(headersProblem(['a'])).toBeTruthy();
    expect(headersProblem({ 'Bad Name': 'x' })).toBeTruthy();
    expect(headersProblem({ 'X-Ok': 'fine' })).toBeNull();
  });
});

describe('regex escaping (ReDoS)', () => {
  test('a catastrophic pattern becomes a literal', () => {
    const pattern = new RegExp(escapeRegex('(a+)+$'));
    expect(pattern.test('(a+)+$')).toBe(true);
    expect(pattern.test('aaaa')).toBe(false);
  });
});

describe('passwords and session revocation', () => {
  test('minimum length everywhere', () => {
    expect(passwordProblem('a')).toBeTruthy();
    expect(passwordProblem(undefined)).toBeTruthy();
    expect(passwordProblem('long-enough')).toBeNull();
  });
  test('tokens issued before a password change are rejected', () => {
    const changedAt = new Date('2026-10-01T10:00:00Z');
    const before = { iat: Math.floor(new Date('2026-09-30T10:00:00Z').getTime() / 1000) };
    const after = { iat: Math.floor(new Date('2026-10-01T10:00:05Z').getTime() / 1000) };
    expect(issuedBeforePasswordChange(before, { passwordChangedAt: changedAt })).toBe(true);
    expect(issuedBeforePasswordChange(after, { passwordChangedAt: changedAt })).toBe(false);
    expect(issuedBeforePasswordChange(before, {})).toBe(false);
  });
});

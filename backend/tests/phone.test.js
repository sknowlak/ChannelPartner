const { getExampleNumber } = require('libphonenumber-js/max');
const examples = require('libphonenumber-js/examples.mobile.json');
const { validatePhoneNumber, validateMobile, validateMobileField, normalizeMobile } = require('../src/utils/phone');

// Library example numbers as fixtures (per the task's own recommendation)
// so these tests track metadata updates instead of hand-picked numbers that
// may quietly go stale as numbering plans change.
const IN_MOBILE = getExampleNumber('IN', examples).number; // +918123456789
const US_MOBILE = getExampleNumber('US', examples).number; // +12015550123
const GB_MOBILE = getExampleNumber('GB', examples).number; // +447400123456
const AE_MOBILE = getExampleNumber('AE', examples).number; // +971501234567

describe('validatePhoneNumber', () => {
  test('valid Indian mobile, national format with country selected', () => {
    const result = validatePhoneNumber(IN_MOBILE.replace('+91', ''), 'IN');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
    expect(result.country).toBe('IN');
  });

  test('valid Indian mobile, "0" trunk-prefix national format', () => {
    const national = IN_MOBILE.replace('+91', '');
    const result = validatePhoneNumber(`0${national}`, 'IN');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
  });

  test('valid Indian mobile, country code without a leading +', () => {
    const result = validatePhoneNumber(IN_MOBILE.replace('+', ''), 'IN');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
  });

  test('valid Indian mobile, full E.164 with spaces', () => {
    const national = IN_MOBILE.replace('+91', '');
    const spaced = `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
    const result = validatePhoneNumber(spaced, undefined);
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
  });

  test('invalid Indian number - right length, no valid pattern matches it at all', () => {
    // 0000000000 isn't a valid mobile OR fixed-line pattern for India - a
    // "right length, wrong prefix" case that isn't just a mobile-vs-landline
    // distinction (see the requireMobile test below for that one).
    const result = validatePhoneNumber('0000000000', 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_FOR_COUNTRY');
  });

  test('Indian fixed-line number is valid but not MOBILE-typed', () => {
    const landline = validatePhoneNumber('01123456789', 'IN');
    expect(landline.valid).toBe(true);
    const mobileOnly = validatePhoneNumber('01123456789', 'IN', { requireMobile: true });
    expect(mobileOnly.valid).toBe(false);
    expect(mobileOnly.code).toBe('NOT_MOBILE');
  });

  test('valid US mobile number with hyphens/brackets', () => {
    const national = US_MOBILE.replace('+1', '');
    const formatted = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    const result = validatePhoneNumber(formatted, 'US');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(US_MOBILE);
  });

  test('valid UK mobile number', () => {
    const result = validatePhoneNumber(GB_MOBILE, undefined);
    expect(result.valid).toBe(true);
    expect(result.country).toBe('GB');
  });

  test('valid UAE mobile number', () => {
    const result = validatePhoneNumber(AE_MOBILE, undefined);
    expect(result.valid).toBe(true);
    expect(result.country).toBe('AE');
  });

  test('too short for the selected country', () => {
    const result = validatePhoneNumber('98765', 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('TOO_SHORT');
  });

  test('too long for the selected country', () => {
    const result = validatePhoneNumber('9876543210987654', 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('TOO_LONG');
  });

  test('not parseable as a number at all', () => {
    const result = validatePhoneNumber('not-a-phone-number', 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID');
  });

  test('empty input', () => {
    expect(validatePhoneNumber('', 'IN').code).toBe('MISSING');
    expect(validatePhoneNumber(undefined, 'IN').code).toBe('MISSING');
    expect(validatePhoneNumber(null, 'IN').code).toBe('MISSING');
  });

  test('country mismatch: IN selected, a +1 US number entered', () => {
    const result = validatePhoneNumber(US_MOBILE, 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('COUNTRY_MISMATCH');
  });

  test('shared calling code +1 resolves to the correct region (US vs CA), not just the dial code', () => {
    // A Canadian number (+1) must not be treated as matching "US" just
    // because they share a calling code.
    const caNumber = '+16135550123'; // 613 is an Ontario (Canada) area code
    const result = validatePhoneNumber(caNumber, 'US');
    expect(result.code).toBe('COUNTRY_MISMATCH');
    const correct = validatePhoneNumber(caNumber, 'CA');
    expect(correct.valid).toBe(true);
    expect(correct.country).toBe('CA');
  });

  test('same E.164 result regardless of formatting - spaces, hyphens, dots, brackets', () => {
    const national = IN_MOBILE.replace('+91', '');
    const variants = [
      IN_MOBILE,
      `+91 ${national.slice(0, 5)} ${national.slice(5)}`,
      `+91-${national.slice(0, 5)}-${national.slice(5)}`,
      `+91.${national.slice(0, 5)}.${national.slice(5)}`,
      national,
      `0${national}`,
      IN_MOBILE.replace('+', '')
    ];
    for (const variant of variants) {
      const result = validatePhoneNumber(variant, 'IN');
      expect(result.valid).toBe(true);
      expect(result.e164).toBe(IN_MOBILE);
    }
  });
});

describe('validateMobile (backward-compatible, no separate country field)', () => {
  test('rejects a bare national number with no embedded country code', () => {
    const result = validateMobile('9876543210');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('MISSING');
  });

  test('accepts "00" as an alternative international prefix', () => {
    const national = IN_MOBILE.replace('+91', '');
    const result = validateMobile(`0091${national}`);
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
  });

  test('accepts a fully-qualified E.164 number', () => {
    const result = validateMobile(IN_MOBILE);
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
  });
});

describe('validateMobileField (optional companion-country wrapper)', () => {
  test('with a country supplied, accepts a bare national number', () => {
    const national = IN_MOBILE.replace('+91', '');
    const result = validateMobileField(national, 'IN');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
  });

  test('with a country supplied, still detects a mismatch', () => {
    const result = validateMobileField(US_MOBILE, 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('COUNTRY_MISMATCH');
  });

  test('without a country, falls back to requiring an embedded "+"', () => {
    const result = validateMobileField('9876543210', undefined);
    expect(result.valid).toBe(false);
  });
});

describe('duplicate detection: format variants resolve to one canonical value', () => {
  test('E.164 output is identical for every input format naming the same number', () => {
    const variants = ['+91 98765 43210', '919876543210', '9876543210'];
    const e164s = variants.map((v) => validatePhoneNumber(v, 'IN').e164);
    expect(new Set(e164s).size).toBe(1);
    expect(e164s[0]).toBe('+919876543210');
  });

  test('normalizeMobile (the legacy digits-only match key) also collapses the same variants', () => {
    const variants = ['+91 98765 43210', '00919876543210', '919876543210'];
    const keys = variants.map(normalizeMobile);
    expect(new Set(keys).size).toBe(1);
  });
});

describe('backend rejects invalid input even when a frontend would have caught it', () => {
  // Simulates a direct API call (e.g. a bypassed/absent frontend, or a
  // webhook/integration caller) sending something the UI would never itself
  // produce - the backend must still be the one to say no.
  test.each([
    ['9876543210', undefined], // no country code at all
    ['+91987', undefined], // too short, even with a country code
    ['+1 415 555 2671'.replace('+1', ''), 'ZZ'], // nonsense country
    ['', undefined]
  ])('rejects %j (country hint: %j)', (raw, country) => {
    const result = validateMobileField(raw, country);
    expect(result.valid).toBe(false);
  });
});

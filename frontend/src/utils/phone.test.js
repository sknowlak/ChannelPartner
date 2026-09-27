import { describe, expect, test } from 'vitest';
import { getExampleNumber } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/examples.mobile.json';
import { validatePhoneNumber, validateMobile, joinMobile, splitMobile, COUNTRY_OPTIONS } from './phone';

// Library example numbers as fixtures (per the task's own recommendation)
// so these tests track metadata updates instead of hand-picked numbers that
// may quietly go stale as numbering plans change. Mirrors
// backend/tests/phone.test.js so both layers are held to the same bar.
const IN_MOBILE = getExampleNumber('IN', examples).number;
const US_MOBILE = getExampleNumber('US', examples).number;
const GB_MOBILE = getExampleNumber('GB', examples).number;
const AE_MOBILE = getExampleNumber('AE', examples).number;

describe('COUNTRY_OPTIONS', () => {
  test('every option has a name, ISO code, and dial code', () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(100);
    const india = COUNTRY_OPTIONS.find((c) => c.iso2 === 'IN');
    expect(india).toMatchObject({ iso2: 'IN', dialCode: '+91' });
    expect(india.name.length).toBeGreaterThan(0);
  });

  test('is generated from the library, not a hand-maintained list - shared dial codes appear on multiple countries', () => {
    const plusOneCountries = COUNTRY_OPTIONS.filter((c) => c.dialCode === '+1');
    expect(plusOneCountries.length).toBeGreaterThan(1); // US, CA, and others all share +1
  });
});

describe('validatePhoneNumber', () => {
  test('valid Indian mobile, national format with country selected', () => {
    const national = IN_MOBILE.replace('+91', '');
    const result = validatePhoneNumber(national, 'IN');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(IN_MOBILE);
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

  test('invalid Indian number - right length, no valid pattern matches it', () => {
    const result = validatePhoneNumber('0000000000', 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_FOR_COUNTRY');
  });

  test('valid US mobile with hyphens/brackets', () => {
    const national = US_MOBILE.replace('+1', '');
    const formatted = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    const result = validatePhoneNumber(formatted, 'US');
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(US_MOBILE);
  });

  test('valid UK mobile number', () => {
    expect(validatePhoneNumber(GB_MOBILE, undefined).valid).toBe(true);
  });

  test('valid UAE mobile number', () => {
    expect(validatePhoneNumber(AE_MOBILE, undefined).valid).toBe(true);
  });

  test('too short', () => {
    expect(validatePhoneNumber('98765', 'IN').code).toBe('TOO_SHORT');
  });

  test('too long', () => {
    expect(validatePhoneNumber('9876543210987654', 'IN').code).toBe('TOO_LONG');
  });

  test('invalid prefix / unparseable input', () => {
    expect(validatePhoneNumber('not-a-phone-number', 'IN').code).toBe('INVALID');
  });

  test('empty input', () => {
    expect(validatePhoneNumber('', 'IN').code).toBe('MISSING');
  });

  test('country mismatch: IN selected, a US number entered', () => {
    const result = validatePhoneNumber(US_MOBILE, 'IN');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('COUNTRY_MISMATCH');
  });

  test('mobile-only enforcement rejects a confidently-typed fixed-line number', () => {
    const result = validatePhoneNumber('01123456789', 'IN', { requireMobile: true });
    expect(result.valid).toBe(false);
    expect(result.code).toBe('NOT_MOBILE');
  });

  test('spaces, hyphens, dots and brackets all resolve to the same E.164 value', () => {
    const national = IN_MOBILE.replace('+91', '');
    const variants = [
      IN_MOBILE,
      `+91 ${national.slice(0, 5)} ${national.slice(5)}`,
      `+91-${national.slice(0, 5)}-${national.slice(5)}`,
      `+91.${national.slice(0, 5)}.${national.slice(5)}`,
      national,
      `0${national}`
    ];
    for (const variant of variants) {
      expect(validatePhoneNumber(variant, 'IN').e164).toBe(IN_MOBILE);
    }
  });
});

describe('validateMobile (used by every existing PhoneInput-driven form)', () => {
  test('rejects a bare national number with no embedded country code', () => {
    expect(validateMobile('9876543210').valid).toBe(false);
  });

  test('accepts a fully-qualified E.164 number', () => {
    expect(validateMobile(IN_MOBILE).valid).toBe(true);
  });
});

describe('splitMobile / joinMobile round-trip (PhoneInput plumbing)', () => {
  test('splitting an E.164 value recovers the country and national number', () => {
    const split = splitMobile(IN_MOBILE);
    expect(split.iso2).toBe('IN');
    expect(split.local).toBe(IN_MOBILE.replace('+91', ''));
  });

  test('joining them back reproduces the original E.164 value', () => {
    const split = splitMobile(IN_MOBILE);
    expect(joinMobile(split.iso2, split.local)).toBe(IN_MOBILE);
  });
});

describe('duplicate detection: format variants resolve to one canonical value', () => {
  test('E.164 output is identical for every input format naming the same number', () => {
    const variants = ['+91 98765 43210', '919876543210', '9876543210'];
    const e164s = variants.map((v) => validatePhoneNumber(v, 'IN').e164);
    expect(new Set(e164s).size).toBe(1);
    expect(e164s[0]).toBe('+919876543210');
  });
});

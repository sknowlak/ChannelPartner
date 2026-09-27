// Country-aware phone validation, backed entirely by libphonenumber-js's own
// per-country metadata - no hand-written per-country regex/length table
// anywhere in this file. Uses the "max" metadata bundle specifically
// (not the default "min" one) because number-TYPE detection (mobile vs
// fixed-line - see isMobileType below) needs the fuller pattern data; the
// min bundle silently returns UNKNOWN for every number's type.
// libphonenumber-js version: see backend/package.json ("^1.13.14" at time
// of writing - metadata updates as numbering plans change, so pin/bump
// deliberately, not silently, since what counts as "valid" can shift).
const { parsePhoneNumberFromString, validatePhoneNumberLength } = require('libphonenumber-js/max');

let regionNames;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}
function countryName(iso2) {
  try {
    return (regionNames && regionNames.of(iso2)) || iso2;
  } catch {
    return iso2;
  }
}

// Stable, frontend-shared error codes (see frontend/src/utils/phone.js -
// keep the two in sync; this is the "map library results to clear
// user-facing messages" step, not a hand-rolled validity check).
const ERROR_MESSAGES = {
  MISSING: 'Phone number is required.',
  INVALID: 'Please enter a valid phone number.',
  TOO_SHORT: 'Phone number is too short.',
  TOO_LONG: 'Phone number is too long.',
  INVALID_FOR_COUNTRY: (country) => `This phone number is not valid for ${countryName(country)}.`,
  COUNTRY_MISMATCH: 'Please select the correct country code.',
  NOT_MOBILE: 'Please enter a mobile number, not a landline.'
};

function fail(code, country) {
  const message = typeof ERROR_MESSAGES[code] === 'function' ? ERROR_MESSAGES[code](country) : ERROR_MESSAGES[code];
  return { valid: false, code, message };
}

// The one required flow (selected country -> library metadata -> parse ->
// validate -> E.164) for every phone field in the app.
//   rawInput       - whatever the user/API caller typed: "9876543210",
//                    "+91 98765-43210", "(415) 555-2671", "098765 43210", etc.
//   selectedCountry - ISO 3166-1 alpha-2 (e.g. "IN") the UI's country
//                    selector (or an API caller) says this number belongs
//                    to. This, not the dial code, is the source of truth -
//                    +1 alone can't tell US from CA, +7 can't tell Russia
//                    from Kazakhstan.
//   options.requireMobile - reject numbers the library confidently types
//                    as FIXED_LINE (never rejects on an ambiguous/unknown
//                    type, since plenty of countries don't distinguish).
function validatePhoneNumber(rawInput, selectedCountry, options = {}) {
  const text = rawInput === undefined || rawInput === null ? '' : String(rawInput).trim();
  if (!text) return fail('MISSING');

  // validatePhoneNumberLength runs a cheap length-only check against the
  // selected country's metadata before a full parse, which is exactly
  // where "too short"/"too long" (as opposed to "wrong pattern") comes from.
  const lengthIssue = validatePhoneNumberLength(text, selectedCountry);
  if (lengthIssue === 'TOO_SHORT') return fail('TOO_SHORT');
  if (lengthIssue === 'TOO_LONG') return fail('TOO_LONG');
  if (lengthIssue === 'NOT_A_NUMBER') return fail('INVALID');
  // 'INVALID_COUNTRY' (no/bad selectedCountry with a non-"+" input) and
  // 'INVALID_LENGTH' fall through to the full parse below, which reports
  // the same failure more specifically (COUNTRY_MISMATCH / INVALID_FOR_COUNTRY).

  const parsed = parsePhoneNumberFromString(text, selectedCountry);
  if (!parsed) return fail('INVALID');

  // An explicit international prefix in the input (e.g. "+1 415...") that
  // resolves to a different country than the one selected - reject rather
  // than silently accepting it under the wrong country. A bare national
  // number (no "+"/"00...") is always interpreted AS the selected country
  // by parsePhoneNumberFromString, so this branch only fires for a genuine
  // mismatch, never for ordinary national-format input.
  if (selectedCountry && parsed.country && parsed.country !== selectedCountry) {
    return fail('COUNTRY_MISMATCH');
  }

  if (!parsed.isValid()) return fail('INVALID_FOR_COUNTRY', selectedCountry);

  if (options.requireMobile) {
    const type = parsed.getType(); // needs the /max bundle - MOBILE | FIXED_LINE | FIXED_LINE_OR_MOBILE | ... | undefined
    if (type === 'FIXED_LINE') return fail('NOT_MOBILE');
  }

  return {
    valid: true,
    code: 'VALID',
    e164: parsed.number,
    country: parsed.country,
    dialCode: `+${parsed.countryCallingCode}`,
    nationalNumber: parsed.nationalNumber
  };
}

// --- Backward-compatible entry points used by existing call sites ---
// Historically every call site only had a single raw string (no separate
// "selected country" field on the wire) and required the country code to
// already be embedded as a leading "+". validateMobile keeps exactly that
// contract; new call sites that DO have a selected-country field (the
// PhoneInput-driven ones) should call validatePhoneNumber directly so a
// bare national number ("9876543210") validates correctly instead of being
// rejected for "missing a country code" it never needed the user to type.
function validateMobile(raw) {
  if (!raw || !String(raw).trim()) return { valid: false, code: 'MISSING', reason: ERROR_MESSAGES.MISSING };
  let candidate = String(raw).trim();
  const digitsAndPlus = candidate.replace(/[\s().-]/g, '');
  if (/^00\d/.test(digitsAndPlus)) candidate = `+${digitsAndPlus.slice(2)}`;
  if (!candidate.startsWith('+')) {
    return { valid: false, code: 'MISSING', reason: 'Mobile number must include a country code (e.g. +91XXXXXXXXXX)' };
  }
  const result = validatePhoneNumber(candidate, undefined);
  if (!result.valid) return { valid: false, code: result.code, reason: result.message };
  return { valid: true, code: 'VALID', e164: result.e164, reason: undefined };
}

// Convenience wrapper for endpoints that accept an OPTIONAL companion
// country field alongside the raw number (e.g. createMyRegistration's
// `customer.mobileCountry`) - the "expected architecture" flow (country
// selection -> parse with that as the default region) when the caller
// provides one, falling back to validateMobile's stricter
// require-an-embedded-"+" behavior when they don't, so existing callers
// that never sent a country are unaffected.
function validateMobileField(raw, country) {
  if (!country) return validateMobile(raw);
  const result = validatePhoneNumber(raw, country);
  if (!result.valid) return { valid: false, code: result.code, reason: result.message };
  return { valid: true, code: 'VALID', e164: result.e164, reason: undefined };
}

// Best-effort match key for data older than validatePhoneNumber's mandatory
// country code (see scripts/migrateAddCountryCode.js) - kept only so
// pre-migration records/tests referencing it don't need to change; new
// code should compare `mobile`/`phone_number_e164` (both hold the same
// validated E.164 string) directly instead, per the duplicate-detection
// rule below.
function normalizeMobile(raw) {
  if (!raw) return '';
  let candidate = String(raw).trim();
  const digitsAndPlus = candidate.replace(/[\s().-]/g, '');
  if (/^00\d/.test(digitsAndPlus)) candidate = `+${digitsAndPlus.slice(2)}`;
  const parsed = parsePhoneNumberFromString(candidate);
  if (parsed && parsed.isValid()) return parsed.number.replace(/\D/g, '');
  return candidate.replace(/\D/g, '');
}

module.exports = { validatePhoneNumber, validateMobile, validateMobileField, normalizeMobile, countryName };

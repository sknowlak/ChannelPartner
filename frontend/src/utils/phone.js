// Country-aware phone validation, backed entirely by libphonenumber-js's
// own per-country metadata - no hand-written per-country regex/length
// table anywhere in this file. Uses the "max" metadata bundle specifically
// (not the default "min" one) because number-TYPE detection (mobile vs
// fixed-line) needs the fuller pattern data; the min bundle silently
// returns undefined for every number's type. Mirrors
// backend/src/utils/phone.js's validatePhoneNumber exactly (same error
// codes/messages) so a lead never passes the client only to bounce off the
// server with a different-sounding complaint.
// libphonenumber-js version: see frontend/package.json - metadata updates
// change what counts as valid, so bump this deliberately, not silently.
import {
  getCountries, getCountryCallingCode, parsePhoneNumberFromString, validatePhoneNumberLength
} from 'libphonenumber-js/max';

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

export const COUNTRY_OPTIONS = getCountries()
  .map((iso2) => ({ iso2, dialCode: `+${getCountryCallingCode(iso2)}`, name: regionNames ? regionNames.of(iso2) : iso2 }))
  .sort((a, b) => a.name.localeCompare(b.name));

function countryName(iso2) {
  const found = COUNTRY_OPTIONS.find((c) => c.iso2 === iso2);
  return found ? found.name : iso2;
}

export function detectDefaultCountry() {
  try {
    const region = new Intl.Locale(navigator.language || 'en-US').maximize().region;
    if (region && getCountries().includes(region)) return region;
  } catch {
    // ignore - browsers without Intl.Locale/region support fall through
  }
  return 'IN';
}

// Splits a stored/incoming "+<dialcode><number>" string into the country
// dropdown + local-number pieces a <PhoneInput> needs to display.
export function splitMobile(fullNumber) {
  if (!fullNumber) return { iso2: detectDefaultCountry(), local: '' };
  const parsed = parsePhoneNumberFromString(String(fullNumber));
  if (parsed && parsed.country) return { iso2: parsed.country, local: parsed.nationalNumber };
  return { iso2: detectDefaultCountry(), local: String(fullNumber).replace(/\D/g, '') };
}

export function joinMobile(iso2, local) {
  if (!local) return '';
  try {
    return `+${getCountryCallingCode(iso2)}${local}`;
  } catch {
    return local;
  }
}

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
// validate -> E.164) for every phone field in the app. See
// backend/src/utils/phone.js's validatePhoneNumber for the identical logic
// and the reasoning behind each step.
export function validatePhoneNumber(rawInput, selectedCountry, options = {}) {
  const text = rawInput === undefined || rawInput === null ? '' : String(rawInput).trim();
  if (!text) return fail('MISSING');

  const lengthIssue = validatePhoneNumberLength(text, selectedCountry);
  if (lengthIssue === 'TOO_SHORT') return fail('TOO_SHORT');
  if (lengthIssue === 'TOO_LONG') return fail('TOO_LONG');
  if (lengthIssue === 'NOT_A_NUMBER') return fail('INVALID');

  const parsed = parsePhoneNumberFromString(text, selectedCountry);
  if (!parsed) return fail('INVALID');

  if (selectedCountry && parsed.country && parsed.country !== selectedCountry) {
    return fail('COUNTRY_MISMATCH');
  }
  if (!parsed.isValid()) return fail('INVALID_FOR_COUNTRY', selectedCountry);

  if (options.requireMobile) {
    const type = parsed.getType();
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

// Backward-compatible wrapper used by every existing call site (formValidation.js,
// PartnerSignup, MyProfile, PartnerRegistration): validates a single already-
// joined "+<dialcode><number>" string with no separate country hint (the
// country, if any, comes from whatever "+" prefix is already embedded -
// which is exactly what <PhoneInput>'s onChange always produces).
export function validateMobile(value) {
  const result = validatePhoneNumber(value, undefined);
  if (!result.valid) return { valid: false, code: result.code, reason: result.message };
  return { valid: true, code: 'VALID', reason: undefined };
}

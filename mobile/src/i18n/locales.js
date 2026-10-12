import MANIFEST from './languages.json';

// Supported languages (sections 54-55) come from ./languages.json, generated
// by tools/i18n/translate.mjs and shared by every app and the backend (the
// same tool regenerates ./resources.js with the matching file imports).
//   quality "reviewed" - written and reviewed by people (en, hi, bn);
//   quality "machine"  - produced by machine translation at build time.
// `intl` is the locale passed to Intl date/number formatting (en-IN keeps
// lakh/crore grouping).
export const SUPPORTED_LOCALES = MANIFEST;

export const DEFAULT_LOCALE = 'en';

export const isSupportedLocale = (code) => SUPPORTED_LOCALES.some((l) => l.code === code);

export const localeInfo = (code) => SUPPORTED_LOCALES.find((l) => l.code === code) || SUPPORTED_LOCALES[0];

// Matches a device locale tag ("pt-BR", "ta-IN", "zh-Hans-CN") to a supported
// code: exact tag first, then its base language, then any regional variant.
export function matchLocale(tag) {
  const t = String(tag || '').toLowerCase();
  if (!t) return null;
  const exact = SUPPORTED_LOCALES.find((l) => l.code.toLowerCase() === t);
  if (exact) return exact.code;
  const base = t.split('-')[0];
  const sameBase = SUPPORTED_LOCALES.find((l) => l.code.toLowerCase() === base)
    || SUPPORTED_LOCALES.find((l) => l.code.toLowerCase().startsWith(`${base}-`));
  return sameBase ? sameBase.code : null;
}

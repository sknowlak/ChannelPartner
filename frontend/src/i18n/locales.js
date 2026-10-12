import MANIFEST from './languages.json';

// Supported languages (sections 54-55) come from ./languages.json, generated
// by tools/i18n/translate.mjs and shared by every app and the backend. A
// language is listed only once every app has all of its translation files.
//   quality "reviewed" - written and reviewed by people (en, hi, bn);
//   quality "machine"  - produced by machine translation at build time.
// `intl` is the locale passed to Intl.DateTimeFormat / NumberFormat (en-IN
// keeps lakh/crore grouping); `dir` is the text direction (rtl for Arabic,
// Urdu, ...), applied to <html dir>.
export const SUPPORTED_LOCALES = MANIFEST;

export const DEFAULT_LOCALE = 'en';

export const isSupportedLocale = (code) => SUPPORTED_LOCALES.some((l) => l.code === code);

export const localeInfo = (code) => SUPPORTED_LOCALES.find((l) => l.code === code) || SUPPORTED_LOCALES[0];

// Matches a browser/device tag ("pt-BR", "zh-Hant-TW", "ta") to a supported
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

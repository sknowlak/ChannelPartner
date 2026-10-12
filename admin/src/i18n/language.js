import { DEFAULT_LOCALE, isSupportedLocale, localeInfo, matchLocale } from './locales';

// Which language to show (section 54), in order of precedence:
//   1. the signed-in admin's saved account preference (NavBar selector) - applied
//      at login and when the profile loads, so it follows them to any device;
//   2. the language last chosen on this device (before signing in, or by
//      someone without an account preference yet);
//   3. the browser's language, if it is one we support;
//   4. English.
// Only the language code is stored locally - never credentials.
const STORAGE_KEY = 'uiLanguage';

export function storedLanguage() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isSupportedLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function rememberLanguage(code) {
  try {
    if (isSupportedLocale(code)) localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable - the choice still applies for this session */
  }
}

export function browserLanguage(languages = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []) {
  for (const tag of languages || []) {
    const code = matchLocale(tag);
    if (code) return code;
  }
  return null;
}

export function initialLanguage() {
  return storedLanguage() || browserLanguage() || DEFAULT_LOCALE;
}

export function applyDocumentLanguage(code) {
  if (typeof document === 'undefined') return;
  const info = localeInfo(code);
  document.documentElement.lang = info.code;
  document.documentElement.dir = info.dir;
}

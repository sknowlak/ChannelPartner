import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales';
import { NAMESPACES, resources } from './resources';
import { deviceLanguage } from './language';

// Initialised synchronously with the phone's language; the language saved
// on this device (async secure store) is applied before the first screen
// renders and the account preference on top of it - see ./language.js.
i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
  ns: NAMESPACES,
  defaultNS: 'common',
  // Plural keys use the i18next v4 JSON format (_one/_other). Where Hermes
  // lacks Intl.PluralRules, i18next falls back to a one/other rule.
  compatibilityJSON: 'v4',
  // React Native renders text, never HTML - nothing to escape.
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  // A key missing in Hindi/Bengali falls back to English; in development
  // that is reported so it gets translated rather than silently shipped.
  saveMissing: __DEV__,
  missingKeyHandler: (lngs, ns, key) => {
    if (__DEV__) console.warn(`[i18n] missing "${ns}:${key}" for ${lngs.join(',')}`);
  },
  react: { useSuspense: false },
  // No sponsor message in the device log.
  showSupportNotice: false
});

export default i18n;

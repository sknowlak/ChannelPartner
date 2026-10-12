import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales';
import { initialLanguage, applyDocumentLanguage } from './language';

// Admin portal copy of the partner app's i18n setup (frontend/src/i18n).
// Terminology MUST follow frontend/src/i18n/glossary.md - the one glossary
// shared by every app, so the same concept never has two names.

// Every JSON file under locales/<lang>/ is a namespace (file name =
// namespace). Files are code-split and fetched only for the language in
// use (plus English as the fallback), so offering 100+ languages doesn't
// grow the initial download (section 55).
const loaders = import.meta.glob('./locales/*/*.json');
export const NAMESPACES = Object.keys(loaders)
  .map((p) => /\.\/locales\/en\/([^/]+)\.json$/.exec(p)?.[1])
  .filter(Boolean);

const lazyBackend = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    const load = loaders[`./locales/${language}/${namespace}.json`];
    if (!load) return callback(null, {});
    return load().then((mod) => callback(null, mod.default || mod), (err) => callback(err, false));
  }
};

// Resolves once English and the starting language are loaded - main.jsx
// waits for it, so the first render never shows a raw key.
export const i18nReady = i18n.use(lazyBackend).use(initReactI18next).init({
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
  load: 'currentOnly',
  preload: [DEFAULT_LOCALE],
  ns: NAMESPACES,
  defaultNS: 'common',
  // React already escapes; translations are never rendered as raw HTML.
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  // A key missing in a language falls back to English; in development
  // that is reported so it gets translated rather than silently shipped.
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (lngs, ns, key) => {
    if (import.meta.env.DEV) console.warn(`[i18n] missing "${ns}:${key}" for ${lngs.join(',')}`);
  },
  react: { useSuspense: false },
  showSupportNotice: false
});

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales';
import { initialLanguage, applyDocumentLanguage } from './language';

// Every JSON file under locales/<lang>/ is a namespace (file name =
// namespace). English is bundled (the fallback, always needed); any other
// language is fetched as plain JSON from /locales/<lang>/<ns>.json only when
// chosen, so offering 200+ languages doesn't grow the download or the build
// (section 55; files emitted by tools/i18n/viteLocales.mjs).
const english = import.meta.glob('./locales/en/*.json', { eager: true, import: 'default' });
export const NAMESPACES = Object.keys(english).map((p) => /([^/]+)\.json$/.exec(p)[1]);

const lazyBackend = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    if (language === DEFAULT_LOCALE) return callback(null, english[`./locales/en/${namespace}.json`] || {});
    return fetch(`${import.meta.env.BASE_URL}locales/${language}/${namespace}.json?v=${__I18N_VERSION__}`)
      .then((res) => {
        if (res.status === 404) return {};
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => callback(null, data), (err) => callback(err, false));
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

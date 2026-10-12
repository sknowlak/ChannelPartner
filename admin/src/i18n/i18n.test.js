import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import i18n, { i18nReady } from './index';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './locales';
import { browserLanguage } from './language';
import { fieldLabel, groupLabel, optionLabel } from './dataLabels';
import { enumLabel } from './enumLabels';
import { formatDate } from '../utils/timezone';

// Section 54: every language has exactly the keys English has, with the
// same {{placeholders}}, so nothing renders as a raw key or loses a value.
// (Same approach as frontend/src/i18n/i18n.test.js.)
const files = import.meta.glob('./locales/*/*.json', { eager: true });
const bundles = {};
for (const [path, mod] of Object.entries(files)) {
  const [, lang, ns] = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  (bundles[lang] ||= {})[ns] = mod.default || mod;
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}\u0000${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const placeholders = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

// Plural keys differ by language (section 55): English has _one/_other,
// Arabic needs _zero.._other, Japanese only _other. Keys are compared by
// their base, and each language must have every plural form it uses.
const PLURAL = /_(zero|one|two|few|many|other)$/;
function shape(flat) {
  const plain = new Set();
  const plurals = new Map();
  for (const k of Object.keys(flat)) {
    const m = PLURAL.exec(k);
    if (m) {
      const base = k.slice(0, -m[0].length);
      if (!plurals.has(base)) plurals.set(base, new Set());
      plurals.get(base).add(m[1]);
    } else plain.add(k);
  }
  return { plain, plurals };
}
const pluralForms = (lang) => {
  try { return new Intl.PluralRules(lang).resolvedOptions().pluralCategories; } catch { return ['one', 'other']; }
};
const show = (k) => k.replace(/\u0000/g, '.');


describe('translation key coverage', () => {
  const en = bundles[DEFAULT_LOCALE];
  for (const { code } of SUPPORTED_LOCALES.filter((l) => l.code !== DEFAULT_LOCALE)) {
    test(`${code} has every namespace English has`, () => {
      expect(Object.keys(bundles[code] || {}).sort()).toEqual(Object.keys(en).sort());
    });
    for (const ns of Object.keys(en)) {
      test(`${code}:${ns} has the same keys, plural forms, string values and placeholders`, () => {
        const a = flatten(en[ns]);
        const b = flatten(bundles[code]?.[ns]);
        const sa = shape(a);
        const sb = shape(b);
        const missing = [...sa.plain].filter((k) => !sb.plain.has(k)).map(show);
        const extra = [...sb.plain].filter((k) => !sa.plain.has(k)).map(show);
        const pluralMismatch = [...new Set([...sa.plurals.keys(), ...sb.plurals.keys()])]
          .filter((base) => !sa.plurals.has(base) || !sb.plurals.has(base)
            || pluralForms(code).some((c) => !sb.plurals.get(base).has(c)))
          .map(show);
        expect({ missing, extra, pluralMismatch }).toEqual({ missing: [], extra: [], pluralMismatch: [] });
        for (const [k, v] of Object.entries(b)) {
          const m = PLURAL.exec(k);
          const source = m ? a[`${k.slice(0, -m[0].length)}_${m[1] === 'one' ? 'one' : 'other'}`] ?? a[`${k.slice(0, -m[0].length)}_other`] : a[k];
          expect(typeof v, `${ns}:${show(k)} type`).toBe(typeof source);
          expect(placeholders(v), `${ns}:${show(k)} placeholders`).toEqual(placeholders(source));
          expect(String(v).trim().length, `${ns}:${show(k)} is empty`).toBeGreaterThan(0);
        }
      });
    }
  }

  test('English values are never empty', () => {
    for (const [ns, bundle] of Object.entries(bundles[DEFAULT_LOCALE])) {
      for (const [k, v] of Object.entries(flatten(bundle))) {
        expect(String(v).trim().length, `${ns}:${k.replace(/\u0000/g, '.')}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('runtime behaviour', () => {
  // In the browser other languages are fetched from /locales/<lang>/<ns>.json;
  // there is no server here, so load the same files directly.
  beforeAll(async () => {
    await i18nReady;
    for (const [lang, nss] of Object.entries(bundles)) {
      for (const [ns, data] of Object.entries(nss)) {
        if (!i18n.hasResourceBundle(lang, ns)) i18n.addResourceBundle(lang, ns, data);
      }
    }
  });
  beforeEach(() => i18n.changeLanguage('en'));

  test('switching language changes text without reloading', async () => {
    expect(i18n.t('nav:links.dashboard')).toBe('Dashboard');
    await i18n.changeLanguage('hi');
    expect(i18n.t('nav:links.dashboard')).toBe('डैशबोर्ड');
    await i18n.changeLanguage('bn');
    expect(i18n.t('nav:links.dashboard')).toBe('ড্যাশবোর্ড');
  });

  test('a key missing in a language falls back to English, never a raw key', async () => {
    i18n.addResource('en', 'common', 'onlyInEnglishForTest', 'English text');
    await i18n.changeLanguage('bn');
    expect(i18n.t('common:onlyInEnglishForTest')).toBe('English text');
  });

  test('an unsupported language falls back to English', async () => {
    await i18n.changeLanguage('xx');
    expect(i18n.t('common:actions.save')).toBe('Save');
  });

  test('pluralisation and interpolation', async () => {
    expect(i18n.t('audit:total', { count: 1 })).toBe('1 total event');
    expect(i18n.t('audit:total', { count: 5 })).toBe('5 total events');
    await i18n.changeLanguage('bn');
    expect(i18n.t('audit:total', { count: 5 })).toBe('মোট 5টি ইভেন্ট');
  });

  test('browser language detection picks a supported language or nothing', () => {
    expect(browserLanguage(['hi-IN', 'en'])).toBe('hi');
    expect(browserLanguage(['bn-BD'])).toBe('bn');
    expect(browserLanguage(['xx-XX', 'qaa'])).toBeNull();
  });

  test('dates follow the language', async () => {
    const instant = '2026-10-11T06:30:00Z';
    const en = formatDate(instant, 'Asia/Kolkata');
    await i18n.changeLanguage('hi');
    expect(formatDate(instant, 'Asia/Kolkata')).not.toBe(en);
  });

  test('enum values get translated labels; unknown values show as-is', async () => {
    await i18n.changeLanguage('hi');
    expect(enumLabel('kycStatus', 'VERIFIED')).toBe('सत्यापित');
    expect(enumLabel('status', 'ACTIVE')).toBe('सक्रिय');
    expect(enumLabel('kycStatus', 'SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  test('built-in partner field labels translate; admin-renamed or custom ones stay as typed', async () => {
    await i18n.changeLanguage('bn');
    expect(fieldLabel({ fieldKey: 'city', label: 'City' })).toBe('শহর');
    expect(fieldLabel({ fieldKey: 'city', label: 'Town' })).toBe('Town');
    expect(fieldLabel({ fieldKey: 'city', label: 'City', isCustom: true })).toBe('City');
    expect(groupLabel('Banking')).toBe('ব্যাংকিং');
    expect(groupLabel('My Group')).toBe('My Group');
    expect(optionLabel('Savings')).toBe('সঞ্চয়');
  });
});

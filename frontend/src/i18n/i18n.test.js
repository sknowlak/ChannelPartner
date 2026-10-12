import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import i18n, { i18nReady } from './index';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './locales';
import { browserLanguage } from './language';
import { fieldLabel, optionLabel, statusLabel, groupLabel } from './dataLabels';
import { formatDate } from '../utils/timezone';
import { formatCurrency } from '../utils/currency';

// Section 54: every language has exactly the keys English has, with the
// same {{placeholders}}, so nothing renders as a raw key or loses a value.
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
});

describe('runtime behaviour', () => {
  beforeAll(() => i18nReady);
  beforeEach(() => i18n.changeLanguage('en'));

  test('switching language changes text without reloading', async () => {
    expect(i18n.t('common:actions.save')).toBe('Save');
    await i18n.changeLanguage('hi');
    expect(i18n.t('common:actions.save')).toBe('सहेजें');
    await i18n.changeLanguage('bn');
    expect(i18n.t('common:actions.save')).toBe('সংরক্ষণ করুন');
  });

  test('a key missing in a language falls back to English, never a raw key', async () => {
    i18n.addResource('en', 'common', 'onlyInEnglishForTest', 'English text');
    await i18n.changeLanguage('hi');
    expect(i18n.t('common:onlyInEnglishForTest')).toBe('English text');
  });

  test('pluralisation and interpolation', async () => {
    expect(i18n.t('common:counts.leads', { count: 1 })).toBe('1 lead');
    expect(i18n.t('common:counts.leads', { count: 5 })).toBe('5 leads');
    await i18n.changeLanguage('bn');
    expect(i18n.t('common:counts.leads', { count: 5 })).toBe('5টি লিড');
  });

  test('browser language detection picks a supported language or nothing', () => {
    expect(browserLanguage(['hi-IN', 'en'])).toBe('hi');
    expect(browserLanguage(['bn-BD'])).toBe('bn');
    expect(browserLanguage(['fr-FR', 'de'])).toBeNull();
  });

  test('dates and numbers follow the language; currency code and amount do not change', async () => {
    const instant = '2026-10-11T06:30:00Z';
    const en = formatDate(instant, 'Asia/Kolkata');
    const enMoney = formatCurrency(1500000, 'INR');
    await i18n.changeLanguage('hi');
    const hi = formatDate(instant, 'Asia/Kolkata');
    const hiMoney = formatCurrency(1500000, 'INR');
    expect(en).not.toBe(hi);
    expect(enMoney).toContain('INR');
    expect(hiMoney).toContain('INR');
    expect(enMoney.replace(/\D/g, '')).toBe('1500000');
  });

  test('default data labels translate; partner-renamed ones stay as typed', async () => {
    await i18n.changeLanguage('hi');
    const def = { fieldKey: 'name', label: 'Name' };
    expect(fieldLabel(def)).not.toBe('Name');
    expect(fieldLabel({ fieldKey: 'name', label: 'Buyer Name' })).toBe('Buyer Name');
    expect(statusLabel('Site Visit')).not.toBe('Site Visit');
    expect(statusLabel('My Custom Stage')).toBe('My Custom Stage');
    expect(optionLabel('2.5 BHK')).toBeTruthy();
    expect(groupLabel('Lead Info')).not.toBe('Lead Info');
  });
});

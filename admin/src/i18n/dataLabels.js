import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE } from './locales';

// Partner field labels, groups and dropdown options are admin-configurable
// DATA. Only values that still equal a built-in English default
// (locales/en/data.json, generated from backend/src/config/partnerFieldDefaults.js
// by scripts/generate-data-catalogue.mjs) are translated for display;
// anything an admin typed or renamed is shown exactly as stored. The stored
// value is never changed - these are display-only lookups (section 54).
//
// Bundles are indexed directly (not via t()) because values could contain
// dots that i18next would treat as key paths.
function lookup(section, raw) {
  if (raw === undefined || raw === null || raw === '') return raw;
  const en = i18n.getResourceBundle(DEFAULT_LOCALE, 'data') || {};
  const key = String(raw);
  if (!en[section] || !(key in en[section])) return raw;
  const current = i18n.getResourceBundle(i18n.language, 'data') || {};
  return current[section]?.[key] || en[section][key];
}

// A field's label is translated only while it still matches the default for
// that fieldKey - a relabelled default field keeps the admin's label.
export function fieldLabel(def) {
  const en = i18n.getResourceBundle(DEFAULT_LOCALE, 'data') || {};
  if (!def || def.isCustom || en.fieldLabels?.[def.fieldKey] !== def.label) return def?.label;
  const current = i18n.getResourceBundle(i18n.language, 'data') || {};
  return current.fieldLabels?.[def.fieldKey] || def.label;
}
export const groupLabel = (group) => lookup('groups', group);
export const optionLabel = (value) => lookup('options', value);

// Hook form: re-renders the component when the language changes.
export function useDataLabels() {
  useTranslation('data');
  return { fieldLabel, groupLabel, optionLabel };
}

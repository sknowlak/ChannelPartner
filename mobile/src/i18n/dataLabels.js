import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE } from './locales';

// Field labels, dropdown options and lead status names are
// partner-configurable DATA (mirrors frontend/src/i18n/dataLabels.js). Only
// values that still equal a built-in English default (locales/en/data.json)
// are translated for display; anything a partner typed or renamed is shown
// exactly as entered. The stored/sent value is never changed.
//
// Bundles are indexed directly (not via t()) because some values contain
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
// that fieldKey - a relabelled default field keeps the partner's label.
export function fieldLabel(def) {
  const en = i18n.getResourceBundle(DEFAULT_LOCALE, 'data') || {};
  if (!def || en.fieldLabels?.[def.fieldKey] !== def.label) return def?.label;
  const current = i18n.getResourceBundle(i18n.language, 'data') || {};
  return current.fieldLabels?.[def.fieldKey] || def.label;
}

export const optionLabel = (value) => lookup('options', value);
export const statusLabel = (name) => lookup('statuses', name);
export const subStatusLabel = (name) => lookup('subStatuses', name);

// Hook form: re-renders the component when the language changes.
export function useDataLabels() {
  useTranslation('data');
  return { fieldLabel, optionLabel, statusLabel, subStatusLabel };
}

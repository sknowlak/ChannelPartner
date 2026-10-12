import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE } from './locales';

// Field labels, groups, dropdown options, statuses and role names are
// partner-configurable DATA. Only values that still equal a built-in
// English default (locales/en/data.json, generated from the backend
// defaults) are translated for display; anything a partner typed or renamed
// is shown exactly as entered. The stored value is never changed - these
// are display-only lookups (section 54).
//
// Bundles are indexed directly (not via t()) because some values contain
// dots ("2.5 BHK") that i18next would treat as key paths.
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
function defaultFieldLabel(section, def) {
  const en = i18n.getResourceBundle(DEFAULT_LOCALE, 'data') || {};
  if (!def || en[section]?.[def.fieldKey] !== def.label) return def?.label;
  const current = i18n.getResourceBundle(i18n.language, 'data') || {};
  return current[section]?.[def.fieldKey] || def.label;
}

export const fieldLabel = (def) => defaultFieldLabel('fieldLabels', def);
export const userFieldLabel = (def) => defaultFieldLabel('userFieldLabels', def);
export const groupLabel = (group) => lookup('groups', group);
export const optionLabel = (value) => lookup('options', value);
export const statusLabel = (name) => lookup('statuses', name);
export const subStatusLabel = (name) => lookup('subStatuses', name);
export const roleLabel = (name) => lookup('roles', name);

// Hook form: re-renders the component when the language changes.
export function useDataLabels() {
  useTranslation('data');
  return { fieldLabel, userFieldLabel, groupLabel, optionLabel, statusLabel, subStatusLabel, roleLabel };
}

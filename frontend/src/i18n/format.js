import i18n from 'i18next';
import { localeInfo } from './locales';

// The Intl locale for the current UI language (en -> en-IN, hi -> hi-IN,
// bn -> bn-IN). Formatting only - stored values are never localized.
export function intlLocale() {
  return localeInfo(i18n.language).intl;
}

export function formatNumber(value, options) {
  if (value === undefined || value === null || value === '') return '-';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  try {
    return new Intl.NumberFormat(intlLocale(), options).format(n);
  } catch {
    return String(n);
  }
}

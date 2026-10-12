import i18n from 'i18next';
import { localeInfo } from './locales';

// Dates and numbers in the current UI language (en -> en-IN, hi -> hi-IN,
// bn -> bn-IN). Display only - stored values are never localized.
export function intlLocale() {
  return localeInfo(i18n.language).intl;
}

function toDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '-';
  try {
    return d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toDateString();
  }
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '-';
  try {
    return d.toLocaleString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return d.toString();
  }
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

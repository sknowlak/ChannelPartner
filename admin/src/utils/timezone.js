// The app is used worldwide (spec section 32) - every date the backend
// sends is a plain UTC ISO timestamp; these helpers render it in the
// admin's chosen zone using the native Intl API (no extra dependency).
// The display LOCALE follows the UI language (section 54) - the same
// instant renders as "11 Oct 2026" in English and "11 अक्तू॰ 2026" in Hindi.
import { intlLocale } from '../i18n/format';

export const COMMON_TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Australia/Sydney', 'Pacific/Auckland'
];

export function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatDateTime(value, timezone) {
  if (!value) return '-';
  const tz = timezone || detectBrowserTimezone();
  try {
    return new Intl.DateTimeFormat(intlLocale(), {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString(intlLocale());
  }
}

export function formatDate(value, timezone) {
  if (!value) return '-';
  const tz = timezone || detectBrowserTimezone();
  try {
    return new Intl.DateTimeFormat(intlLocale(), { timeZone: tz, dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleDateString(intlLocale());
  }
}

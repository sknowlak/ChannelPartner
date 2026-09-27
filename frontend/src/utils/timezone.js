// The app is used worldwide (spec section 32) - every date the backend
// sends is a plain UTC ISO timestamp; these helpers render it in a specific
// person's chosen zone using the native Intl API (no extra dependency).

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
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

export function formatDate(value, timezone) {
  if (!value) return '-';
  const tz = timezone || detectBrowserTimezone();
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleDateString();
  }
}

export function formatTime(value, timezone) {
  if (!value) return '-';
  const tz = timezone || detectBrowserTimezone();
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, timeStyle: 'short' }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleTimeString();
  }
}

function dateKeyInZone(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

// "Today" / "Yesterday" / a plain date, used to group activity-log entries
// by calendar day (section 42) - computed in the viewer's own timezone so
// the day boundary lines up with their wall-clock, not the server's.
export function dayLabel(value, timezone) {
  if (!value) return '-';
  const tz = timezone || detectBrowserTimezone();
  try {
    const target = dateKeyInZone(value, tz);
    const today = dateKeyInZone(Date.now(), tz);
    const yesterday = dateKeyInZone(Date.now() - 24 * 60 * 60 * 1000, tz);
    if (target === today) return 'Today';
    if (target === yesterday) return 'Yesterday';
    return formatDate(value, tz);
  } catch {
    return formatDate(value, tz);
  }
}

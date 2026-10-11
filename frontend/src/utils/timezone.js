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

// --- <input type="datetime-local"> in a chosen zone (section 49) ---------
// The browser's datetime-local input has no timezone of its own; these map
// it to/from the user's PROFILE timezone, so a time typed in matches the
// times the rest of the app shows (which are all rendered in that zone).

function zoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function toZonedInputValue(value, timezone) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || detectBrowserTimezone(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function fromZonedInputValue(input, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(input || '');
  if (!match) return '';
  const tz = timezone || detectBrowserTimezone();
  const [, y, mo, d, h, mi] = match.map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  let ts = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), tz);
  // Re-check once in case the guess crossed a DST boundary.
  const corrected = wallAsUtc - zoneOffsetMs(new Date(ts), tz);
  if (corrected !== ts) ts = corrected;
  return new Date(ts).toISOString();
}

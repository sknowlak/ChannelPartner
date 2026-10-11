import { describe, expect, test } from 'vitest';
import { fromZonedInputValue, toZonedInputValue } from './timezone';

describe('datetime-local in a profile timezone', () => {
  test('wall time in the profile zone maps to the right instant', () => {
    expect(fromZonedInputValue('2026-10-06T11:00', 'Asia/Kolkata')).toBe('2026-10-06T05:30:00.000Z');
    expect(fromZonedInputValue('2026-10-06T11:00', 'UTC')).toBe('2026-10-06T11:00:00.000Z');
    expect(fromZonedInputValue('2026-07-01T09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z');
    expect(fromZonedInputValue('2026-01-15T09:00', 'America/New_York')).toBe('2026-01-15T14:00:00.000Z');
  });

  test('round-trips', () => {
    for (const tz of ['Asia/Kolkata', 'Europe/London', 'America/Los_Angeles', 'Pacific/Auckland']) {
      expect(toZonedInputValue(fromZonedInputValue('2026-03-29T10:45', tz), tz)).toBe('2026-03-29T10:45');
    }
  });

  test('empty / invalid input', () => {
    expect(fromZonedInputValue('', 'UTC')).toBe('');
    expect(toZonedInputValue(null, 'UTC')).toBe('');
  });
});

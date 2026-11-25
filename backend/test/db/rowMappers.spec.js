import { formatCalendarDate } from '../../src/db/rowMappers.js';

describe('formatCalendarDate', () => {
  it('keeps the calendar day of a DATE parsed as local midnight (no UTC shift)', () => {
    // node-pg turns DATE '2026-12-05' into new Date(2026, 11, 5) in the server's local timezone.
    expect(formatCalendarDate(new Date(2026, 11, 5))).toBe('2026-12-05');
  });

  it('passes YYYY-MM-DD strings through and returns null for empty or invalid values', () => {
    expect(formatCalendarDate('2026-01-31')).toBe('2026-01-31');
    expect(formatCalendarDate(null)).toBeNull();
    expect(formatCalendarDate(undefined)).toBeNull();
    expect(formatCalendarDate(new Date('not a date'))).toBeNull();
  });
});

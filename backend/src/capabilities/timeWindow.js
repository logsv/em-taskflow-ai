/**
 * Time-window resolution for capability tools (plan 3.2). The metric tools measure 7d / 30d / 90d.
 * A window the owner names is mapped to one of those; a span the tools cannot measure exactly is
 * mapped to the nearest one *and the answer says so* (no silent 30d default).
 */
export const SUPPORTED_WINDOWS = { '7d': 7, '30d': 30, '90d': 90 };

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const UNIT_DAYS = { day: 1, week: 7, fortnight: 14, month: 30, quarter: 90, year: 365 };

/** Nearest supported window for a span in days. */
export function nearestWindow(days) {
  return Object.entries(SUPPORTED_WINDOWS)
    .sort(([, a], [, b]) => Math.abs(a - days) - Math.abs(b - days) || b - a)[0][0];
}

/**
 * @param {string} query
 * @returns {{ window: string, days: number, phrase: string, exact: boolean } | null}
 *   null when the query names no time span (the tool's own default applies).
 */
export function resolveTimeWindow(query) {
  const q = String(query || '').toLowerCase();

  // "last/past/previous N days|weeks|months", "N-day", "in the last 2 weeks"
  const n = q.match(/\b(?:last|past|previous|over the|in the last|trailing)?\s*(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twelve)[\s-]*(day|week|month|quarter|year)s?\b/);
  if (n) {
    const count = Number.isFinite(Number(n[1])) ? Number(n[1]) : WORD_NUMBERS[n[1]];
    return fromDays(count * UNIT_DAYS[n[2]], n[0].trim());
  }

  const phrases = [
    [/\b(this|last|past|previous) week\b|\bweekly\b|\bthe week\b/, 7],
    [/\b(this|last|past|previous) fortnight\b/, 14],
    [/\b(this|last|past|previous) month\b|\bmonthly\b|\bmtd\b/, 30],
    [/\b(this|last|past|previous) quarter\b|\bquarterly\b|\bqtd\b|\bq[1-4]\b/, 90],
    [/\b(this|last|past|previous) year\b|\bytd\b|\byear to date\b|\bannual\b/, 365],
    [/\btoday\b|\byesterday\b/, 1],
  ];
  for (const [re, days] of phrases) {
    const m = q.match(re);
    if (m) return fromDays(days, m[0]);
  }
  return null;
}

function fromDays(days, phrase) {
  const window = nearestWindow(days);
  return { window, days, phrase, exact: SUPPORTED_WINDOWS[window] === days };
}

/** One-line note for the answer when the measured window differs from what was asked. */
export function timeWindowNote(resolved) {
  if (!resolved || resolved.exact) return null;
  return `You asked about "${resolved.phrase}"; metrics are measured over 7, 30 or 90 days, so this uses the nearest window (${resolved.window}).`;
}

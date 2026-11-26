import { resolveTimeWindow, nearestWindow, timeWindowNote } from '../../src/capabilities/timeWindow.js';

describe('resolveTimeWindow', () => {
  const cases = [
    ['DORA metrics this week', '7d', true],
    ['lead time over the last 7 days', '7d', true],
    ['how did we do last month', '30d', true],
    ['change failure rate in the last 30 days', '30d', true],
    ['deploys this quarter', '90d', true],
    ['MTTR for Q3', '90d', true],
    ['in the last 2 weeks', '7d', false],
    ['last three months', '90d', true],
    ['over the last 6 months', '90d', false],
    ['year to date', '90d', false],
    ['since yesterday', '7d', false],
  ];
  for (const [q, window, exact] of cases) {
    it(`"${q}" -> ${window}${exact ? '' : ' (nearest)'}`, () => {
      const r = resolveTimeWindow(q);
      expect(r.window).toBe(window);
      expect(r.exact).toBe(exact);
    });
  }

  it('returns null when no span is named, and does not read "1-on-1" as a span', () => {
    expect(resolveTimeWindow('What are our DORA metrics?')).toBeNull();
    expect(resolveTimeWindow('When was my last 1-on-1 with Sam?')).toBeNull();
  });

  it('nearestWindow prefers the larger window on a tie and the note names it', () => {
    expect(nearestWindow(14)).toBe('7d');
    expect(nearestWindow(60)).toBe('90d');
    expect(timeWindowNote(resolveTimeWindow('last 6 months'))).toContain('(90d)');
    expect(timeWindowNote(resolveTimeWindow('this week'))).toBeNull();
  });
});

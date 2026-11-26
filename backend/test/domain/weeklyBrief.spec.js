import { buildWeeklyBrief } from '../../src/domain/weeklyBrief.js';

const NOW = new Date('2026-11-25T12:00:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

describe('buildWeeklyBrief', () => {
  it('says the week is not measured when there are no completed audits (no default score)', () => {
    const b = buildWeeklyBrief({ auditRuns: [{ status: 'FAILED', healthScore: null, createdAt: daysAgo(1) }], actionItems: [], now: NOW });
    expect(b.measured).toBe(false);
    expect(b.health).toEqual({ audits: 0, start: null, end: null, change: null });
    expect(b.metrics).toBeNull();
    expect(b.markdown).toContain('No completed audits in the last 7 days');
    expect(b.markdown).not.toMatch(/\/100/);
  });

  it('reports health change over the window from completed audits only', () => {
    const b = buildWeeklyBrief({
      now: NOW,
      auditRuns: [
        { status: 'COMPLETED', healthScore: 50, createdAt: daysAgo(10) }, // outside window
        { status: 'COMPLETED', healthScore: 70, createdAt: daysAgo(6), doraSummary: { tier: null } },
        { status: 'COMPLETED', healthScore: 64, createdAt: daysAgo(1), deliverySummary: { stalledPrsCount: 4 }, sprintOkrSummary: { sprintPacingPct: null } },
      ],
    });
    expect(b.health).toEqual({ audits: 2, start: 70, end: 64, change: -6 });
    expect(b.metrics.stalledPrs).toBe(4);
    expect(b.metrics.sprintPacingPct).toBeNull();
    expect(b.markdown).toContain('64/100 (-6 over the week)');
    expect(b.markdown).toContain('Sprint pacing: n/a');
  });

  it('counts the action item lifecycle and lists past-due, top open and dismissed items', () => {
    const items = [
      { id: 'a', title: 'Old critical', severity: 'CRITICAL', status: 'PENDING', createdAt: daysAgo(20), dueDate: '2026-11-20' },
      { id: 'b', title: 'New medium', severity: 'MEDIUM', status: 'IN_PROGRESS', createdAt: daysAgo(2) },
      { id: 'c', title: 'Done', severity: 'HIGH', status: 'COMPLETED', createdAt: daysAgo(3), completedAt: daysAgo(1) },
      { id: 'd', title: 'Not ours', severity: 'LOW', status: 'DISMISSED', createdAt: daysAgo(3), updatedAt: daysAgo(1), dismissedReason: 'Other team owns it' },
      { id: 'e', title: 'Later', severity: 'HIGH', status: 'SNOOZED', createdAt: daysAgo(4), snoozedUntil: daysAgo(-2) },
    ];
    const b = buildWeeklyBrief({ auditRuns: [], actionItems: items, now: NOW });
    expect(b.actions.created).toBe(4);
    expect(b.actions.completed).toBe(1);
    expect(b.actions.snoozed).toBe(1);
    expect(b.actions.open).toBe(2);
    expect(b.actions.openBySeverity.CRITICAL).toBe(1);
    expect(b.actions.overdue.map((i) => i.id)).toEqual(['a']);
    expect(b.actions.topOpen[0].id).toBe('a');
    expect(b.actions.dismissed[0].reason).toBe('Other team owns it');
    expect(b.markdown).toContain('Not ours: Other team owns it');
    expect(b.markdown).toContain('Past due:** 1');
  });
});

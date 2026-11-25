/**
 * Weekly EM brief, built only from stored audit runs and action items (no LLM, no defaults).
 * Anything not measured in the window is null and rendered "n/a"; an empty week says so.
 */
import { isSuppressed } from './actionItems.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const OPEN = new Set(['PENDING', 'IN_PROGRESS']);

const ts = (v) => (v ? new Date(v).getTime() : NaN);
const inWindow = (v, from, to) => {
  const t = ts(v);
  return Number.isFinite(t) && t >= from && t <= to;
};
const na = (v, suffix = '') => (v === null || v === undefined ? 'n/a' : `${v}${suffix}`);
const isoDay = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * @param {object} input
 * @param {object[]} input.auditRuns  audit runs (any order); only COMPLETED ones with a score count
 * @param {object[]} input.actionItems action items (all statuses)
 * @param {Date} [input.now]
 * @param {number} [input.days]
 */
export function buildWeeklyBrief({ auditRuns = [], actionItems = [], now = new Date(), days = 7 } = {}) {
  const to = now.getTime();
  const from = to - days * DAY_MS;
  const today = isoDay(now);

  const audits = auditRuns
    .filter((r) => r.status === 'COMPLETED' && Number.isFinite(r.healthScore) && inWindow(r.createdAt, from, to))
    .sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
  const first = audits[0] || null;
  const latest = audits.at(-1) || null;

  const created = actionItems.filter((i) => inWindow(i.createdAt, from, to));
  const completed = actionItems.filter((i) => i.status === 'COMPLETED' && inWindow(i.completedAt, from, to));
  const dismissed = actionItems.filter((i) => i.status === 'DISMISSED' && inWindow(i.updatedAt, from, to));
  const snoozed = actionItems.filter((i) => isSuppressed(i, now) && i.status === 'SNOOZED');
  const open = actionItems.filter((i) => OPEN.has(i.status));
  const overdue = open.filter((i) => i.dueDate && i.dueDate < today);

  const openBySeverity = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, open.filter((i) => (i.severity || '').toUpperCase() === s).length]));
  const topOpen = [...open]
    .sort((a, b) => sevRank(a) - sevRank(b) || ts(a.createdAt) - ts(b.createdAt))
    .slice(0, 5)
    .map(pick);

  const metrics = latest ? {
    asOf: latest.createdAt,
    doraTier: latest.doraSummary?.tier ?? null,
    deploymentFrequency: latest.doraSummary?.deploymentFrequency ?? null,
    leadTimeHours: latest.doraSummary?.leadTimeHours ?? null,
    stalledPrs: latest.deliverySummary?.stalledPrsCount ?? null,
    avgPrReviewWaitHours: latest.deliverySummary?.avgPrReviewWaitHours ?? null,
    sprintPacingPct: latest.sprintOkrSummary?.sprintPacingPct ?? null,
    cadenceHealth: latest.peopleSummary?.cadenceHealth ?? null,
    overdue1on1s: latest.peopleSummary?.overdue1on1sCount ?? null,
    sopComplianceScore: latest.sopSummary?.complianceScore ?? null,
  } : null;

  const brief = {
    period: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), days },
    measured: audits.length > 0,
    health: {
      audits: audits.length,
      start: first ? first.healthScore : null,
      end: latest ? latest.healthScore : null,
      change: audits.length >= 2 ? latest.healthScore - first.healthScore : null,
    },
    actions: {
      created: created.length,
      completed: completed.length,
      dismissed: dismissed.map((i) => ({ ...pick(i), reason: i.dismissedReason ?? null })),
      snoozed: snoozed.length,
      open: open.length,
      openBySeverity,
      overdue: overdue.map(pick),
      topOpen,
    },
    metrics,
    message: audits.length ? null : `No completed audits in the last ${days} days; health and metrics are not measured for this week.`,
  };
  brief.markdown = renderWeeklyBriefMarkdown(brief);
  return brief;
}

function sevRank(i) {
  const r = SEVERITY_ORDER.indexOf((i.severity || '').toUpperCase());
  return r === -1 ? SEVERITY_ORDER.length : r;
}

function pick(i) {
  return { id: i.id, title: i.title, severity: i.severity, status: i.status, assigneeName: i.assigneeName ?? null, dueDate: i.dueDate ?? null };
}

export function renderWeeklyBriefMarkdown(b) {
  const day = (iso) => iso.slice(0, 10);
  const lines = [`### Weekly EM brief (${day(b.period.from)} to ${day(b.period.to)})`, ''];

  if (b.health.audits === 0) {
    lines.push(`> ${b.message}`, '');
  } else {
    const change = b.health.change === null ? '' : ` (${b.health.change >= 0 ? '+' : ''}${b.health.change} over the week)`;
    lines.push(`- **Health score:** ${na(b.health.end)}/100${change}, from ${b.health.audits} audit${b.health.audits === 1 ? '' : 's'}`);
  }

  const a = b.actions;
  lines.push(
    `- **Action items:** ${a.created} new, ${a.completed} completed, ${a.dismissed.length} dismissed, ${a.snoozed} snoozed, ${a.open} open`,
    `- **Open by severity:** ${Object.entries(a.openBySeverity).filter(([, n]) => n > 0).map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}`,
  );
  if (a.overdue.length) lines.push(`- **Past due:** ${a.overdue.length} (${a.overdue.map((i) => `${i.title} — due ${i.dueDate}`).join('; ')})`);

  if (b.metrics) {
    const m = b.metrics;
    lines.push(
      '',
      `**Latest audit (${day(new Date(m.asOf).toISOString())})**`,
      `- DORA tier: ${na(m.doraTier)} · deploys: ${na(m.deploymentFrequency)} · lead time: ${na(m.leadTimeHours, 'h')}`,
      `- Stalled PRs: ${na(m.stalledPrs)} · avg review wait: ${na(m.avgPrReviewWaitHours, 'h')}`,
      `- Sprint pacing: ${na(m.sprintPacingPct, '%')} · 1-on-1 cadence: ${na(m.cadenceHealth)} (overdue: ${na(m.overdue1on1s)})`,
      `- SOP compliance: ${na(m.sopComplianceScore, '%')}`,
    );
  }

  if (a.topOpen.length) {
    lines.push('', '**Top open items**');
    for (const i of a.topOpen) lines.push(`- [${i.severity}] ${i.title}${i.assigneeName ? ` — ${i.assigneeName}` : ''}${i.dueDate ? ` (due ${i.dueDate})` : ''}`);
  }
  if (a.dismissed.length) {
    lines.push('', '**Dismissed this week**');
    for (const i of a.dismissed) lines.push(`- ${i.title}: ${i.reason || 'no reason recorded'}`);
  }
  return lines.join('\n');
}

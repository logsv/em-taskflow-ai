/**
 * DORA metrics from stored dora_snapshots rows (snake_case columns). Measured values only.
 */
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function tierFor(value, eliteMax, highMax) {
  if (value === null) return null;
  if (value <= eliteMax) return 'ELITE';
  if (value <= highMax) return 'HIGH';
  return 'MEDIUM';
}

function deltaPct(current, previous) {
  if (current === null || previous === null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** Metrics this endpoint has no data source for. Reported as not measured, never as numbers. */
const NOT_MEASURED_METRICS = {
  availability_slo: { name: 'Operational Availability (SLO)', unit: '%', benchmark: 'Target ≥ 99.90%', description: 'Production uptime. Needs an uptime/SLO source, which is not connected.' },
  pr_cycle_time: { name: 'PR Review Cycle Time', unit: 'hours', benchmark: '< 8 Hours SLA', description: 'Time pull requests spend in review. Ask the Delivery capability for measured values.' },
  sprint_predictability: { name: 'Sprint Predictability & Velocity', unit: '%', benchmark: 'Target ≥ 85%', description: 'Committed vs completed points. Ask the Sprint capability for measured values.' },
  code_churn_rate: { name: 'Code Churn / Rework Rate', unit: '%', benchmark: '< 10% Risk Limit', description: 'Code rewritten within 21 days of merge. No data source is connected.' },
};

/**
 * Build the DORA response from stored snapshots (newest first). Only measured values are
 * returned; anything without data is null with status NO_DATA / NOT_MEASURED. Trends compare
 * the latest snapshot with the previous one and are null when there is no previous snapshot.
 */
export function buildDoraResponse(snapshots = [], teamId = null) {
  const [latest, previous] = Array.isArray(snapshots) ? snapshots : [];
  const cur = {
    df: num(latest?.deployment_frequency),
    lt: num(latest?.lead_time_hours),
    cfr: num(latest?.change_failure_rate),
    mttr: num(latest?.mttr_hours),
  };
  const prev = {
    df: num(previous?.deployment_frequency),
    lt: num(previous?.lead_time_hours),
    cfr: num(previous?.change_failure_rate),
    mttr: num(previous?.mttr_hours),
  };
  const measured = (v, render, status) => (v === null
    ? { value: null, numeric: null, status: 'NO_DATA', tier: null, trend: null }
    : { value: render(v), numeric: v, status, tier: status ? status[0] + status.slice(1).toLowerCase() : null });

  const df = measured(cur.df, (v) => `${v} / week`, cur.df === null ? null : (cur.df >= 7 ? 'ELITE' : cur.df >= 1 ? 'HIGH' : 'MEDIUM'));
  const lt = measured(cur.lt, (v) => `${v}h`, tierFor(cur.lt, 24, 168));
  const cfr = measured(cur.cfr, (v) => `${v}%`, tierFor(cur.cfr, 5, 15));
  const mttr = measured(cur.mttr, (v) => `${v}h`, tierFor(cur.mttr, 2, 24));
  if (df.numeric !== null) df.trend = deltaPct(cur.df, prev.df);
  if (lt.numeric !== null) lt.trend = deltaPct(cur.lt, prev.lt);
  if (cfr.numeric !== null) cfr.trend = deltaPct(cur.cfr, prev.cfr);
  if (mttr.numeric !== null) mttr.trend = deltaPct(cur.mttr, prev.mttr);

  const allFour = [cur.lt, cur.cfr, cur.mttr].every((v) => v !== null);
  const rating = !allFour
    ? null
    : (cur.lt <= 24 && cur.cfr <= 5 && cur.mttr <= 2) ? 'ELITE'
      : (cur.lt <= 168 && cur.cfr <= 15 && cur.mttr <= 24) ? 'HIGH' : 'MEDIUM';

  const metrics = {
    deployment_frequency: { name: 'Deployment Frequency', unit: 'deploys/week', benchmark: 'Daily to Weekly', description: 'Frequency of successful production releases', ...df },
    lead_time: { name: 'Lead Time for Changes', unit: 'hours', benchmark: '< 24 Hours SLA', description: 'Code commit to production delivery turnaround time', ...lt },
    change_failure_rate: { name: 'Change Failure Rate', unit: '%', benchmark: '< 5% Target', description: 'Percentage of releases requiring hotfixes or rollbacks', ...cfr },
    mttr: { name: 'Mean Time to Recovery (MTTR)', unit: 'hours', benchmark: '< 2 Hours SLA', description: 'Time elapsed to restore healthy state after an incident', ...mttr },
  };
  for (const [key, meta] of Object.entries(NOT_MEASURED_METRICS)) {
    metrics[key] = { ...meta, value: null, numeric: null, status: 'NOT_MEASURED', tier: null, trend: null };
  }

  return {
    measured: !!latest,
    rating,
    period: latest ? { start: latest.period_start ?? null, end: latest.period_end ?? null } : null,
    team_id: teamId || latest?.team_id || null,
    snapshot_at: latest?.created_at ?? null,
    deployment_frequency: cur.df === null ? null : `${cur.df} deploys/week`,
    lead_time_hours: cur.lt,
    change_failure_rate_pct: cur.cfr,
    mttr_hours: cur.mttr,
    metrics,
    benchmarks: { standard: 'Google Cloud DORA 2024 / Accelerate State of DevOps', maturity_tier: rating },
    ...(latest ? {} : { message: 'No DORA snapshot stored yet. Run a team sync or ask the DORA capability to compute one.' }),
  };
}

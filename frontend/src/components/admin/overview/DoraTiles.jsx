import React from 'react';

/** Overview tiles. Values come only from /em/dora; anything not measured shows n/a. */
export const DORA_TILES = [
  { key: 'deployment_frequency', icon: '🚀', label: 'Deployment Frequency' },
  { key: 'lead_time', icon: '⏱️', label: 'Lead Time for Changes' },
  { key: 'change_failure_rate', icon: '🛡️', label: 'Change Failure Rate' },
  { key: 'mttr', icon: '🚑', label: 'Mean Time to Recovery' },
  { key: 'availability_slo', icon: '📈', label: 'Availability (SLO)' },
  { key: 'pr_cycle_time', icon: '🔍', label: 'PR Review Cycle Time' },
  { key: 'sprint_predictability', icon: '🎯', label: 'Sprint Predictability' },
  { key: 'code_churn_rate', icon: '🔄', label: 'Code Churn Rate' },
];

/** DORA + delivery tiles for the Admin overview. Shows n/a / NO DATA / NOT MEASURED, never defaults. */
export function DoraTiles({ doraMetrics }) {
  return (
    <>
    <div className="dora-metrics-grid">
      {DORA_TILES.map(({ key, icon, label }) => {
        const m = doraMetrics?.metrics?.[key];
        const measured = m && m.value !== null && m.value !== undefined;
        return (
          <div className="dora-metric-box" key={key}>
            <div className="dora-metric-top">
              <span className="dora-metric-icon">{icon}</span>
              <span className={`metric-tier-badge ${measured && m.tier ? `tier-${String(m.tier).toLowerCase().replace(/[^a-z]/g, '')}` : 'tier-none'}`}>
                {measured ? (m.tier || '').toUpperCase() || 'MEASURED' : (m?.status === 'NOT_MEASURED' ? 'NOT MEASURED' : 'NO DATA')}
              </span>
            </div>
            <div className="dora-num">{measured ? m.value : 'n/a'}</div>
            <div className="dora-label">{label}</div>
            <div className="dora-sub">{m?.benchmark || ''}</div>
            {measured && m.trend ? (
              <div className={`dora-trend ${String(m.trend).startsWith('-') ? 'trend-down' : 'trend-up'}`}>
                {String(m.trend).startsWith('-') ? '↓' : '↑'} {m.trend} vs previous snapshot
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
    {doraMetrics && !doraMetrics.measured && (
      <p className="section-subdesc">{doraMetrics.message || 'No DORA snapshot stored yet.'}</p>
    )}
    </>
  );
}

import React from 'react';

/**
 * One evaluation gate. Shows the measured value and PASS/FAIL against the threshold, or
 * NOT RUN when no evaluation result exists (never a default score).
 */
export function EvalGateCard({ icon, title, sub, value, threshold, format }) {
  const has = typeof value === 'number' && Number.isFinite(value);
  const shown = !has ? 'n/a' : format === 'pct' ? `${(value * 100).toFixed(0)}%` : value.toFixed(4);
  const shownThreshold = format === 'pct' ? `${Math.round(threshold * 100)}%` : threshold.toFixed(2);
  const badge = !has ? 'NOT RUN' : value >= threshold ? `PASS (≥${shownThreshold})` : `FAIL (<${shownThreshold})`;
  const badgeClass = !has ? '' : value >= threshold ? 'badge-pass' : 'badge-fail';
  return (
    <div className="eval-card">
      <div className="eval-card-top">
        <span className="eval-card-icon">{icon}</span>
        <span className={`eval-badge ${badgeClass}`}>{badge}</span>
      </div>
      <div className="eval-card-value">{shown}</div>
      <div className="eval-card-title">{title}</div>
      <div className="eval-card-sub">{sub}</div>
    </div>
  );
}

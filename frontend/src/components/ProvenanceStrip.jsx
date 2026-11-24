import React from 'react';
import './ProvenanceStrip.css';

const SOURCE_LABELS = {
  github: 'GitHub',
  jira: 'Jira',
  notion: 'Notion',
  slack: 'Slack',
  googleCalendar: 'Google Calendar',
  google: 'Google Calendar',
  default: 'Team data',
  rag: 'Documents',
};

function relativeTime(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(t).toLocaleDateString();
}

/**
 * Shows where an answer's data came from: live, snapshot (with age) or unavailable.
 * @param {{ provenance?: Array<{source:string, mode:'live'|'snapshot'|'none', asOf?:string|null, dataAvailability?:string|null, domain?:string}>, onRefresh?: () => void, refreshing?: boolean }} props
 */
export default function ProvenanceStrip({ provenance = [], onRefresh, refreshing = false }) {
  if (!Array.isArray(provenance) || provenance.length === 0) return null;

  // One chip per source (latest entry wins), unavailable sources last.
  const bySource = new Map();
  provenance.forEach((p) => bySource.set(p.source, p));
  const items = [...bySource.values()].sort((a, b) => (a.mode === 'none') - (b.mode === 'none'));
  const hasSnapshot = items.some((p) => p.mode === 'snapshot');

  return (
    <div className="provenance-strip" aria-label="Data sources for this answer">
      <span className="provenance-label">Data:</span>
      {items.map((p) => {
        const label = SOURCE_LABELS[p.source] || p.source;
        const age = relativeTime(p.asOf);
        const text = p.mode === 'live'
          ? `${label} · live${age ? ` · ${age}` : ''}`
          : p.mode === 'snapshot'
            ? `${label} · snapshot${age ? ` from ${age}` : ''}`
            : `${label} · unavailable`;
        return (
          <span key={p.source} className={`provenance-chip provenance-${p.mode}`} title={p.dataAvailability || p.dataSource || ''}>
            {text}
          </span>
        );
      })}
      {hasSnapshot && onRefresh && (
        <button type="button" className="provenance-refresh" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Syncing…' : '↻ Refresh live data'}
        </button>
      )}
    </div>
  );
}

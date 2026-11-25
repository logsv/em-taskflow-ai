import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../../services/apiClient.js';

const W = 640;
const H = 180;
const PAD = { top: 12, right: 16, bottom: 26, left: 34 };
const RANGES = [7, 30, 90];

/** Chart geometry for health-score points (0–100 y axis). Exported for tests. */
export function trendGeometry(points, width = W, height = H) {
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const times = points.map((p) => new Date(p.at).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const span = t1 - t0 || 1;
  const xy = points.map((p, i) => ({
    x: PAD.left + (points.length === 1 ? innerW / 2 : ((times[i] - t0) / span) * innerW),
    y: PAD.top + (1 - Math.max(0, Math.min(100, p.healthScore)) / 100) * innerH,
    p,
  }));
  const path = xy.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  return { xy, path, innerW, innerH };
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Health score per completed audit run (GET /api/actions/health-trend). Only measured runs are
 * plotted; with no runs it says so instead of drawing a flat or default line.
 */
export function HealthTrendView({ data, days, onDaysChange }) {
  const points = data?.points || [];
  const change = data?.change;
  const latest = points.at(-1)?.healthScore;

  return (
    <div className="health-trend-card">
      <div className="health-trend-head">
        <div>
          <div className="health-trend-title">Health score trend</div>
          <div className="health-trend-sub">
            {points.length
              ? `${points.length} completed audit${points.length === 1 ? '' : 's'} · latest ${latest}`
              : 'No measured audits in this window'}
            {change !== null && change !== undefined && (
              <span className={`health-trend-change ${change >= 0 ? 'up' : 'down'}`}>
                {' '}{change >= 0 ? '↑' : '↓'} {Math.abs(change)} pts over {days}d
              </span>
            )}
          </div>
        </div>
        <div className="health-trend-ranges" role="group" aria-label="Trend window">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              className={`health-trend-range ${d === days ? 'active' : ''}`}
              aria-pressed={d === days}
              onClick={() => onDaysChange?.(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <p className="section-subdesc">{data?.message || `No completed audits in the last ${days} days.`} Run an audit from the Action Hub to start the trend.</p>
      ) : (
        <TrendSvg points={points} />
      )}
    </div>
  );
}

function TrendSvg({ points }) {
  const { xy, path, innerW } = trendGeometry(points);
  const gridYs = [0, 50, 100];
  return (
    <svg className="health-trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Health score over ${points.length} audits`}>
      {gridYs.map((v) => {
        const y = PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom);
        return (
          <g key={v}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} className="health-trend-grid" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="health-trend-axis">{v}</text>
          </g>
        );
      })}
      {xy.length > 1 && <path d={path} className="health-trend-line" fill="none" />}
      {xy.map(({ x, y, p }) => (
        <circle key={p.auditRunId ?? p.at} cx={x} cy={y} r={4} className="health-trend-dot">
          <title>{`${new Date(p.at).toLocaleString()}: ${p.healthScore}`}</title>
        </circle>
      ))}
      <text x={PAD.left} y={H - 6} className="health-trend-axis">{fmtDate(points[0].at)}</text>
      {points.length > 1 && (
        <text x={PAD.left + innerW} y={H - 6} textAnchor="end" className="health-trend-axis">{fmtDate(points.at(-1).at)}</text>
      )}
    </svg>
  );
}

/** Fetching wrapper used by the Admin overview. */
export default function HealthTrendChart() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    fetch(apiUrl(`/actions/health-trend?days=${days}`))
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setData(body);
        else setError(body.error || `Could not load the trend (${res.status})`);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [days]);

  if (error) return <div className="health-trend-card"><p className="section-subdesc" role="alert">Health trend unavailable: {error}</p></div>;
  return <HealthTrendView data={data} days={days} onDaysChange={setDays} />;
}

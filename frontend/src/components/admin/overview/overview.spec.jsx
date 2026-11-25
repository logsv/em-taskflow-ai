import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DoraTiles } from './DoraTiles.jsx';
import { EvalGateCard } from './EvalGateCard.jsx';

describe('DoraTiles', () => {
  it('shows n/a and NO DATA when there is no snapshot (no default numbers)', () => {
    render(<DoraTiles doraMetrics={{ measured: false, message: 'No DORA snapshot stored yet.', metrics: {
      deployment_frequency: { value: null, status: 'NO_DATA' },
      code_churn_rate: { value: null, status: 'NOT_MEASURED' },
    } }} />);
    expect(screen.getAllByText('n/a').length).toBe(8);
    expect(screen.getByText('NOT MEASURED')).toBeTruthy();
    expect(screen.getByText('No DORA snapshot stored yet.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/99\.95|91\.4|6\.8%|3\.5 \/ week/);
  });

  it('shows measured values with tier and a trend only when one was computed', () => {
    render(<DoraTiles doraMetrics={{ measured: true, metrics: {
      lead_time: { value: '12h', tier: 'Elite', trend: '-10.0%', benchmark: '< 24 Hours SLA' },
      mttr: { value: '3h', tier: 'High', trend: null },
    } }} />);
    expect(screen.getByText('12h')).toBeTruthy();
    expect(screen.getByText('ELITE')).toBeTruthy();
    expect(screen.getByText(/-10.0% vs previous snapshot/)).toBeTruthy();
    expect(screen.getAllByText(/vs previous snapshot/).length).toBe(1);
  });
});

describe('EvalGateCard', () => {
  it('says NOT RUN instead of showing a default score', () => {
    render(<EvalGateCard icon="x" title="Faithfulness" sub="" value={undefined} threshold={0.8} format="dec" />);
    expect(screen.getByText('NOT RUN')).toBeTruthy();
    expect(screen.getByText('n/a')).toBeTruthy();
  });

  it('fails a measured value below the threshold', () => {
    render(<EvalGateCard icon="x" title="Accuracy" sub="" value={0.7} threshold={0.9} format="pct" />);
    expect(screen.getByText('70%')).toBeTruthy();
    expect(screen.getByText('FAIL (<90%)')).toBeTruthy();
  });
});

describe('HealthTrendView', () => {
  it('says there is no data instead of drawing a default line', async () => {
    const { HealthTrendView } = await import('./HealthTrendChart.jsx');
    render(<HealthTrendView data={{ points: [], change: null, message: 'No completed audits in the last 30 days.' }} days={30} />);
    expect(screen.getByText(/No completed audits in the last 30 days/)).toBeTruthy();
    expect(document.querySelector('svg.health-trend-svg')).toBeNull();
  });

  it('plots one dot per measured audit and shows the change over the window', async () => {
    const { HealthTrendView } = await import('./HealthTrendChart.jsx');
    render(<HealthTrendView days={30} data={{ change: -8, points: [
      { at: '2026-11-01T09:00:00Z', healthScore: 80, auditRunId: 1 },
      { at: '2026-11-10T09:00:00Z', healthScore: 75, auditRunId: 2 },
      { at: '2026-11-20T09:00:00Z', healthScore: 72, auditRunId: 3 },
    ] }} />);
    expect(document.querySelectorAll('circle.health-trend-dot').length).toBe(3);
    expect(screen.getByText(/latest 72/)).toBeTruthy();
    expect(screen.getByText(/↓ 8 pts over 30d/)).toBeTruthy();
  });

  it('maps score 100 to the top and 0 to the bottom of the plot', async () => {
    const { trendGeometry } = await import('./HealthTrendChart.jsx');
    const { xy } = trendGeometry([
      { at: '2026-11-01T00:00:00Z', healthScore: 100 },
      { at: '2026-11-02T00:00:00Z', healthScore: 0 },
    ]);
    expect(xy[0].y).toBeLessThan(xy[1].y);
    expect(xy[0].x).toBeLessThan(xy[1].x);
  });
});

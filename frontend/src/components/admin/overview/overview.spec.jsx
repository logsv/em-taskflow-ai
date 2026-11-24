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

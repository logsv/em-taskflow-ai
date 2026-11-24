import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProvenanceStrip from './ProvenanceStrip';

describe('ProvenanceStrip', () => {
  it('renders nothing without provenance', () => {
    const { container } = render(<ProvenanceStrip provenance={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels live, snapshot and unavailable sources', () => {
    render(
      <ProvenanceStrip
        provenance={[
          { source: 'github', mode: 'live', asOf: new Date().toISOString() },
          { source: 'jira', mode: 'snapshot', asOf: new Date(Date.now() - 3 * 3600_000).toISOString() },
          { source: 'googleCalendar', mode: 'none', asOf: null, dataAvailability: 'no_calendar_data' },
        ]}
      />,
    );
    expect(screen.getByText(/GitHub · live/)).toBeInTheDocument();
    expect(screen.getByText(/Jira · snapshot from 3 h ago/)).toBeInTheDocument();
    expect(screen.getByText(/Google Calendar · unavailable/)).toHaveAttribute('title', 'no_calendar_data');
  });

  it('offers a refresh only when some data is a snapshot', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<ProvenanceStrip provenance={[{ source: 'github', mode: 'live' }]} onRefresh={onRefresh} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ProvenanceStrip provenance={[{ source: 'github', mode: 'snapshot' }]} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: /Refresh live data/ }));
    expect(onRefresh).toHaveBeenCalled();
  });
});

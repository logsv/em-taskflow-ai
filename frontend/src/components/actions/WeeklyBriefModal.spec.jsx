import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import WeeklyBriefModal, { BriefMarkdown } from './WeeklyBriefModal.jsx';

afterEach(() => vi.restoreAllMocks());

describe('BriefMarkdown', () => {
  it('renders headings, bold and bullet lists from the brief markdown', () => {
    render(<BriefMarkdown markdown={'### Weekly EM brief\n\n- **Health score:** 64/100\n- second\n\n> No audits'} />);
    expect(screen.getByRole('heading', { name: 'Weekly EM brief' })).toBeTruthy();
    expect(screen.getByText('Health score:').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem').length).toBe(2);
    expect(screen.getByText('No audits')).toBeTruthy();
  });
});

describe('WeeklyBriefModal', () => {
  it('loads the brief from the API and shows it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ markdown: '### Weekly EM brief (a to b)\n- **Action items:** 2 new' }) });
    render(<WeeklyBriefModal onClose={() => {}} />);
    expect(await screen.findByText(/Weekly EM brief \(a to b\)/)).toBeTruthy();
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/actions/weekly-brief?days=7');
  });

  it('shows the API error instead of an empty brief', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'Database unavailable' }) });
    render(<WeeklyBriefModal onClose={() => {}} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Database unavailable');
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ActionLifecycleControls, { snoozeUntil } from './ActionLifecycleControls.jsx';

describe('ActionLifecycleControls', () => {
  it('snoozes with a future time', async () => {
    const onPatch = vi.fn().mockResolvedValue(null);
    render(<ActionLifecycleControls item={{ id: 'a1', status: 'PENDING' }} onPatch={onPatch} />);
    fireEvent.click(screen.getByText('3 days'));
    await waitFor(() => expect(onPatch).toHaveBeenCalled());
    const patch = onPatch.mock.calls[0][0];
    expect(patch.status).toBe('SNOOZED');
    expect(new Date(patch.snoozedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('saves a due date and shows a backend error', async () => {
    const onPatch = vi.fn().mockResolvedValue('dueDate must be YYYY-MM-DD');
    render(<ActionLifecycleControls item={{ id: 'a1', status: 'PENDING', dueDate: null }} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ dueDate: '2026-12-31' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('offers Wake now for a snoozed item and hides snooze for closed items', () => {
    const { rerender } = render(<ActionLifecycleControls item={{ id: 'a1', status: 'SNOOZED', snoozedUntil: '2026-12-01T09:00:00Z' }} onPatch={vi.fn()} />);
    expect(screen.getByText('Wake now')).toBeTruthy();
    rerender(<ActionLifecycleControls item={{ id: 'a2', status: 'COMPLETED' }} onPatch={vi.fn()} />);
    expect(screen.queryByText('1 week')).toBeNull();
  });

  it('snoozeUntil lands at 09:00 local time the given number of days ahead', () => {
    const now = new Date(2026, 10, 25, 15, 30);
    const until = new Date(snoozeUntil(1, now));
    expect(until.getDate()).toBe(26);
    expect(until.getHours()).toBe(9);
  });
});

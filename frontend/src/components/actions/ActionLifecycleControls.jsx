import React, { useState } from 'react';
import { Button } from '../ui';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Snooze presets in days. The backend wakes the item back to PENDING at that time. */
export const SNOOZE_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

/** ISO time `days` from `now`, at 09:00 local time so it wakes at the start of a work day. */
export function snoozeUntil(days, now = new Date()) {
  const d = new Date(now.getTime() + days * DAY_MS);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Due date and snooze controls for one action item.
 * `onPatch(patch)` sends a PATCH /api/actions/:id body and resolves to an error message or null.
 */
export default function ActionLifecycleControls({ item, onPatch }) {
  const [dueDate, setDueDate] = useState(item.dueDate || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (patch) => {
    setBusy(true);
    setError('');
    const err = await onPatch(patch);
    if (err) setError(err);
    setBusy(false);
  };

  const closed = item.status === 'COMPLETED' || item.status === 'DISMISSED';
  const snoozed = item.status === 'SNOOZED';

  return (
    <div className="ah-drawer-section ah-lifecycle">
      <h3 className="ah-drawer-section-title">🗓 Due date &amp; snooze</h3>

      <div className="ah-lifecycle-row">
        <label htmlFor={`due-${item.id}`} className="ah-lifecycle-label">Due date</label>
        <input
          id={`due-${item.id}`}
          type="date"
          className="ah-lifecycle-input"
          value={dueDate}
          disabled={busy}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || dueDate === (item.dueDate || '')}
          onClick={() => run({ dueDate: dueDate || null })}
        >
          {dueDate ? 'Save' : 'Clear'}
        </Button>
      </div>

      {!closed && (
        <div className="ah-lifecycle-row">
          <span className="ah-lifecycle-label">{snoozed ? 'Snoozed until' : 'Snooze'}</span>
          {snoozed ? (
            <>
              <span className="ah-lifecycle-value">
                {item.snoozedUntil ? new Date(item.snoozedUntil).toLocaleString() : 'n/a'}
              </span>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => run({ status: 'PENDING' })}>
                Wake now
              </Button>
            </>
          ) : (
            SNOOZE_PRESETS.map((p) => (
              <Button
                key={p.days}
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run({ status: 'SNOOZED', snoozedUntil: snoozeUntil(p.days) })}
              >
                {p.label}
              </Button>
            ))
          )}
        </div>
      )}

      <p className="ah-lifecycle-hint">Snoozed and dismissed items do not count against the health score.</p>
      {error && <div className="ah-lifecycle-error" role="alert">{error}</div>}
    </div>
  );
}

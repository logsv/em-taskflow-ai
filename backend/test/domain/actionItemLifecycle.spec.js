import { validateActionItemUpdate, isSuppressed } from '../../src/domain/actionItems.js';

describe('Action item lifecycle rules', () => {
  const now = new Date('2026-11-24T12:00:00Z');

  it('requires a reason to dismiss', () => {
    expect(() => validateActionItemUpdate({ status: 'DISMISSED' }, now)).toThrowError(/dismissedReason is required/);
    expect(() => validateActionItemUpdate({ status: 'DISMISSED', dismissedReason: 'no' }, now)).toThrowError(/at least 3 characters/);
    expect(validateActionItemUpdate({ status: 'DISMISSED', dismissedReason: 'Owned by platform team' }, now).dismissedReason).toBe('Owned by platform team');
  });

  it('requires a future time to snooze', () => {
    expect(() => validateActionItemUpdate({ status: 'SNOOZED' }, now)).toThrowError(/snoozedUntil is required/);
    expect(() => validateActionItemUpdate({ status: 'SNOOZED', snoozedUntil: '2026-11-01T00:00:00Z' }, now)).toThrowError(/in the future/);
    expect(validateActionItemUpdate({ status: 'SNOOZED', snoozedUntil: '2026-12-01T00:00:00Z' }, now).snoozedUntil).toEqual(jasmine.any(Date));
  });

  it('accepts owner and due date changes, and rejects unknown fields and statuses', () => {
    expect(validateActionItemUpdate({ assigneeName: 'Priya', dueDate: '2026-12-05' }, now)).toEqual({ assigneeName: 'Priya', dueDate: '2026-12-05' });
    expect(() => validateActionItemUpdate({ dueDate: '05/12/2026' }, now)).toThrowError(/YYYY-MM-DD/);
    expect(() => validateActionItemUpdate({ status: 'DONE' }, now)).toThrowError(/status/);
    expect(() => validateActionItemUpdate({ priority: 'high' }, now)).toThrowError();
    expect(() => validateActionItemUpdate({}, now)).toThrowError(/Nothing to update/);
  });

  it('treats dismissed and still-snoozed items as set aside', () => {
    expect(isSuppressed({ status: 'DISMISSED' }, now)).toBeTrue();
    expect(isSuppressed({ status: 'SNOOZED', snoozedUntil: '2026-12-01T00:00:00Z' }, now)).toBeTrue();
    expect(isSuppressed({ status: 'SNOOZED', snoozedUntil: '2026-11-01T00:00:00Z' }, now)).toBeFalse();
    expect(isSuppressed({ status: 'PENDING' }, now)).toBeFalse();
  });
});

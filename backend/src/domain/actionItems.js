/**
 * Action item lifecycle rules. Statuses: PENDING → IN_PROGRESS → COMPLETED, or DISMISSED (with a
 * reason) or SNOOZED (until a future time, then back to PENDING). Dismissed and active-snoozed
 * items do not count against the audit health score.
 */
import { z } from 'zod';
import { AppError } from '../core/errors.js';

export const ACTION_ITEM_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED', 'SNOOZED'];

const UpdateSchema = z.object({
  status: z.enum(ACTION_ITEM_STATUSES).optional(),
  resolutionNotes: z.string().max(2000).optional(),
  completedBy: z.string().max(200).optional(),
  dismissedReason: z.string().trim().min(3, 'Give a reason (at least 3 characters) when dismissing').max(500).optional(),
  snoozedUntil: z.coerce.date().optional(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'), z.null()]).optional(),
  assigneeName: z.string().max(200).nullable().optional(),
  assigneeEmail: z.string().email().nullable().optional(),
}).strict();

/**
 * Validate an update and return the normalized patch. Throws AppError('VALIDATION').
 * @param {object} input
 * @param {Date} [now]
 */
export function validateActionItemUpdate(input = {}, now = new Date()) {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  const u = parsed.data;
  if (u.status === 'DISMISSED' && !u.dismissedReason) {
    throw new AppError('VALIDATION', 'dismissedReason is required to dismiss an action item.');
  }
  if (u.status === 'SNOOZED') {
    if (!u.snoozedUntil) throw new AppError('VALIDATION', 'snoozedUntil is required to snooze an action item.');
    if (u.snoozedUntil.getTime() <= now.getTime()) throw new AppError('VALIDATION', 'snoozedUntil must be in the future.');
  }
  if (Object.keys(u).length === 0) throw new AppError('VALIDATION', 'Nothing to update.');
  return u;
}

/** Items the owner has set aside: excluded from the health score while that holds. */
export function isSuppressed(item, now = new Date()) {
  if (!item) return false;
  if (item.status === 'DISMISSED') return true;
  return item.status === 'SNOOZED' && !!item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now.getTime();
}

/** Row mapping helpers shared by the repositories. */

/**
 * A Postgres DATE as YYYY-MM-DD. node-pg parses DATE as local midnight, so toISOString() would
 * shift it a day back east of UTC (IST: 2026-12-05 -> 2026-12-04). Use the local calendar parts.
 */
export function formatCalendarDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function mapAuditRow(row) {
  return {
    id: Number(row.id),
    triggeredBy: row.triggered_by,
    status: row.status,
    healthScore: row.health_score == null ? null : Number(row.health_score),
    summaryMarkdown: row.summary_markdown,
    doraSummary: safeJsonParse(row.dora_summary),
    deliverySummary: safeJsonParse(row.delivery_summary),
    peopleSummary: safeJsonParse(row.people_summary),
    sprintOkrSummary: safeJsonParse(row.sprint_okr_summary),
    sopSummary: safeJsonParse(row.sop_summary),
    slackStatus: safeJsonParse(row.slack_status),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function mapActionItemRow(row) {
  return {
    id: row.id,
    auditRunId: row.audit_run_id ? Number(row.audit_run_id) : null,
    title: row.title,
    description: row.description,
    category: row.category,
    severity: row.severity,
    status: row.status,
    suggestedAction: row.suggested_action,
    assigneeName: row.assignee_name,
    assigneeEmail: row.assignee_email,
    externalReference: safeJsonParse(row.external_reference),
    resolutionNotes: row.resolution_notes,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    dueDate: formatCalendarDate(row.due_date),
    snoozedUntil: row.snoozed_until ?? null,
    dismissedReason: row.dismissed_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function measuredOrNull(v) {
  return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
}

export function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

export function createOpaqueId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeSessionRow(row) {
  return {
    ...row,
    client_info: row.client_info ? safeJsonParse(row.client_info) : null,
  };
}

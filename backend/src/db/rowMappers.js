/** Row mapping helpers shared by the repositories. */
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
    dueDate: row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : null,
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

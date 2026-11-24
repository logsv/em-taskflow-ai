/**
 * Autonomous audit runs and action items.
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */
import { recordHandledError } from '../../core/safe.js';
import { safeJsonParse, mapAuditRow, mapActionItemRow } from '../rowMappers.js';

export class AuditRepository {
  /** Insert an audit run row with `q` (pool or transaction client). */
  async insertAuditRunWith(q, data = {}) {
    const {
      triggeredBy = 'CRON_4H',
      status = 'COMPLETED',
      healthScore = null,
      summaryMarkdown = '',
      doraSummary = {},
      deliverySummary = {},
      peopleSummary = {},
      sprintOkrSummary = {},
      sopSummary = {},
      slackStatus = {},
    } = data;
    const res = await q.query(
        `
        INSERT INTO em_audit_runs (
          triggered_by, status, health_score, summary_markdown,
          dora_summary, delivery_summary, people_summary,
          sprint_okr_summary, sop_summary, slack_status,
          created_at, completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `,
        [
          triggeredBy,
          status,
          healthScore,
          summaryMarkdown,
          JSON.stringify(doraSummary),
          JSON.stringify(deliverySummary),
          JSON.stringify(peopleSummary),
          JSON.stringify(sprintOkrSummary),
          JSON.stringify(sopSummary),
          JSON.stringify(slackStatus),
        ]
      );
    return mapAuditRow(res.rows[0]);
  }

  async createAuditRun(data = {}) {
    const {
      triggeredBy = 'CRON_4H',
      status = 'COMPLETED',
      healthScore = 100,
      summaryMarkdown = '',
      doraSummary = {},
      deliverySummary = {},
      peopleSummary = {},
      sprintOkrSummary = {},
      sopSummary = {},
      slackStatus = {},
    } = data;

    try {
      await this.ensureInitialized();
      const audit = await this.insertAuditRunWith(this.pool, data);
      this.inMemoryAuditRuns.unshift(audit);
      return audit;
    } catch (err) {
      const fallbackAudit = {
        id: this.inMemoryAuditRuns.length + 1,
        triggeredBy,
        status,
        healthScore,
        summaryMarkdown,
        doraSummary,
        deliverySummary,
        peopleSummary,
        sprintOkrSummary,
        sopSummary,
        slackStatus,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      this.inMemoryAuditRuns.unshift(fallbackAudit);
      return fallbackAudit;
    }
  }

  async updateAuditRun(id, data = {}) {
    try {
      await this.ensureInitialized();
      const updates = [];
      const values = [id];
      let valIdx = 2;

      if (data.status !== undefined) {
        updates.push(`status = $${valIdx++}`);
        values.push(data.status);
      }
      if (data.healthScore !== undefined) {
        updates.push(`health_score = $${valIdx++}`);
        values.push(data.healthScore);
      }
      if (data.summaryMarkdown !== undefined) {
        updates.push(`summary_markdown = $${valIdx++}`);
        values.push(data.summaryMarkdown);
      }
      if (data.slackStatus !== undefined) {
        updates.push(`slack_status = $${valIdx++}`);
        values.push(JSON.stringify(data.slackStatus));
      }
      if (data.completedAt !== undefined) {
        updates.push(`completed_at = $${valIdx++}`);
        values.push(data.completedAt);
      }

      if (updates.length > 0) {
        const query = `UPDATE em_audit_runs SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const res = await this.pool.query(query, values);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: Number(row.id),
            triggeredBy: row.triggered_by,
            status: row.status,
            healthScore: Number(row.health_score),
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
      }
    } catch (_e) { recordHandledError('db.postgres.updateAuditRun', _e); }

    const idx = this.inMemoryAuditRuns.findIndex((a) => a.id === Number(id));
    if (idx >= 0) {
      this.inMemoryAuditRuns[idx] = { ...this.inMemoryAuditRuns[idx], ...data };
      return this.inMemoryAuditRuns[idx];
    }
    return null;
  }

  async getLatestAuditRun() {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query(`
        SELECT * FROM em_audit_runs
        ORDER BY created_at DESC
        LIMIT 1
      `);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          id: Number(row.id),
          triggeredBy: row.triggered_by,
          status: row.status,
          healthScore: Number(row.health_score),
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
    } catch (_e) { recordHandledError('db.postgres.getLatestAuditRun', _e); }

    return this.inMemoryAuditRuns[0] || null;
  }

  async getAuditRunById(id) {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query('SELECT * FROM em_audit_runs WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          id: Number(row.id),
          triggeredBy: row.triggered_by,
          status: row.status,
          healthScore: Number(row.health_score),
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
    } catch (_e) { recordHandledError('db.postgres.getAuditRunById', _e); }

    return this.inMemoryAuditRuns.find((a) => a.id === Number(id)) || null;
  }

  async listAuditRuns({ limit = 20, offset = 0 } = {}) {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query(
        `SELECT * FROM em_audit_runs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      if (res.rows.length > 0) {
        return res.rows.map((row) => ({
          id: Number(row.id),
          triggeredBy: row.triggered_by,
          status: row.status,
          healthScore: Number(row.health_score),
          summaryMarkdown: row.summary_markdown,
          doraSummary: safeJsonParse(row.dora_summary),
          deliverySummary: safeJsonParse(row.delivery_summary),
          peopleSummary: safeJsonParse(row.people_summary),
          sprintOkrSummary: safeJsonParse(row.sprint_okr_summary),
          sopSummary: safeJsonParse(row.sop_summary),
          slackStatus: safeJsonParse(row.slack_status),
          createdAt: row.created_at,
          completedAt: row.completed_at,
        }));
      }
    } catch (_e) { recordHandledError('db.postgres.listAuditRuns', _e); }

    return this.inMemoryAuditRuns.slice(offset, offset + limit);
  }

  /** Insert or update one action item with `q` (pool or transaction client). */
  async upsertActionItemWith(q, item) {
    const id = item.id || `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const title = item.title || 'Untitled Action Item';
    const description = item.description || '';
    const category = item.category || 'DELIVERY';
    const severity = item.severity || 'WARNING';
    const status = item.status || 'PENDING';
    const suggestedAction = item.suggestedAction || item.suggested_action || '';
    const assigneeName = item.assigneeName || item.assignee_name || null;
    const assigneeEmail = item.assigneeEmail || item.assignee_email || null;
    const externalReference = item.externalReference || item.external_reference || {};
    const auditRunId = item.auditRunId || item.audit_run_id || null;
    const query = `
          INSERT INTO em_action_items (
            id, audit_run_id, title, description, category, severity,
            status, suggested_action, assignee_name, assignee_email,
            external_reference, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            severity = EXCLUDED.severity,
            suggested_action = EXCLUDED.suggested_action,
            assignee_name = COALESCE(EXCLUDED.assignee_name, em_action_items.assignee_name),
            assignee_email = COALESCE(EXCLUDED.assignee_email, em_action_items.assignee_email),
            external_reference = EXCLUDED.external_reference,
            updated_at = NOW()
          RETURNING *
        `;
        const res = await q.query(query, [
          id,
          auditRunId,
          title,
          description,
          category,
          severity,
          status,
          suggestedAction,
          assigneeName,
          assigneeEmail,
          JSON.stringify(externalReference),
        ]);
    return mapActionItemRow(res.rows[0]);
  }

  /**
   * Persist an audit run and its action items in one transaction, so an audit never exists
   * without its items (or items point at an audit that failed to save). Throws on failure.
   */
  async recordAuditRun(auditData, actionItems = []) {
    const result = await this.withTransaction(async (client) => {
      const audit = await this.insertAuditRunWith(client, auditData);
      const items = [];
      for (const item of actionItems) {
        items.push(await this.upsertActionItemWith(client, { ...item, auditRunId: audit.id }));
      }
      return { auditRun: audit, actionItems: items };
    });
    this.inMemoryAuditRuns.unshift(result.auditRun);
    return result;
  }

  async upsertActionItems(items = []) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const results = [];

    for (const item of items) {
      const id = item.id || `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const title = item.title || 'Untitled Action Item';
      const description = item.description || '';
      const category = item.category || 'DELIVERY';
      const severity = item.severity || 'WARNING';
      const status = item.status || 'PENDING';
      const suggestedAction = item.suggestedAction || item.suggested_action || '';
      const assigneeName = item.assigneeName || item.assignee_name || null;
      const assigneeEmail = item.assigneeEmail || item.assignee_email || null;
      const externalReference = item.externalReference || item.external_reference || {};
      const auditRunId = item.auditRunId || item.audit_run_id || null;

      try {
        await this.ensureInitialized();
        results.push(await this.upsertActionItemWith(this.pool, { ...item, id }));
      } catch (err) {
        const itemObj = {
          id,
          auditRunId,
          title,
          description,
          category,
          severity,
          status,
          suggestedAction,
          assigneeName,
          assigneeEmail,
          externalReference,
          resolutionNotes: null,
          completedAt: null,
          completedBy: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const idx = this.inMemoryActionItems.findIndex((a) => a.id === id);
        if (idx >= 0) {
          this.inMemoryActionItems[idx] = { ...this.inMemoryActionItems[idx], ...itemObj, status: this.inMemoryActionItems[idx].status };
          results.push(this.inMemoryActionItems[idx]);
        } else {
          this.inMemoryActionItems.push(itemObj);
          results.push(itemObj);
        }
      }
    }

    return results;
  }

  async listActionItems({ status, category, severity, assignee, limit = 50, offset = 0 } = {}) {
    try {
      await this.ensureInitialized();
      if (this.pool) await this.wakeSnoozedActionItems();
      const whereClauses = [];
      const values = [];
      let valIdx = 1;

      if (status && status !== 'ALL') {
        whereClauses.push(`status = $${valIdx++}`);
        values.push(status);
      }
      if (category && category !== 'ALL') {
        whereClauses.push(`category = $${valIdx++}`);
        values.push(category);
      }
      if (severity && severity !== 'ALL') {
        whereClauses.push(`severity = $${valIdx++}`);
        values.push(severity);
      }
      if (assignee) {
        whereClauses.push(`(assignee_name ILIKE $${valIdx} OR assignee_email ILIKE $${valIdx})`);
        values.push(`%${assignee}%`);
        valIdx++;
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const query = `
        SELECT * FROM em_action_items
        ${whereSql}
        ORDER BY 
          CASE severity 
            WHEN 'CRITICAL' THEN 1 
            WHEN 'WARNING' THEN 2 
            WHEN 'INFO' THEN 3 
            ELSE 4 
          END ASC,
          created_at DESC
        LIMIT $${valIdx++} OFFSET $${valIdx++}
      `;
      values.push(limit, offset);

      const res = await this.pool.query(query, values);
      return res.rows.map((row) => ({
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (_e) { recordHandledError('db.postgres.listActionItems', _e); }

    let items = [...this.inMemoryActionItems];
    if (status && status !== 'ALL') items = items.filter((i) => i.status === status);
    if (category && category !== 'ALL') items = items.filter((i) => i.category === category);
    if (severity && severity !== 'ALL') items = items.filter((i) => i.severity === severity);
    if (assignee) {
      const a = assignee.toLowerCase();
      items = items.filter((i) => (i.assigneeName || '').toLowerCase().includes(a) || (i.assigneeEmail || '').toLowerCase().includes(a));
    }
    return items.slice(offset, offset + limit);
  }

  async getActionItemById(id) {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query('SELECT * FROM em_action_items WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
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
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    } catch (_e) { recordHandledError('db.postgres.getActionItemById', _e); }

    return this.inMemoryActionItems.find((i) => i.id === id) || null;
  }

  /**
   * Apply a validated lifecycle patch (see domain/actionItems.js). Returns the item or null.
   * Completing sets completed_at/by; dismissing stores the reason; snoozing stores the wake time;
   * any other status clears the snooze.
   */
  async updateActionItem(id, patch) {
    await this.ensureInitialized();
    const sets = [];
    const values = [];
    const add = (column, v) => {
      values.push(v);
      sets.push(column + ' = $' + values.length);
    };
    if (patch.status) {
      add('status', patch.status);
      add('completed_at', patch.status === 'COMPLETED' ? new Date() : null);
      add('completed_by', patch.status === 'COMPLETED' ? (patch.completedBy || 'Engineering Manager') : null);
      add('dismissed_reason', patch.status === 'DISMISSED' ? patch.dismissedReason : null);
      add('snoozed_until', patch.status === 'SNOOZED' ? patch.snoozedUntil : null);
    }
    if (patch.resolutionNotes !== undefined) add('resolution_notes', patch.resolutionNotes);
    if (patch.dueDate !== undefined) add('due_date', patch.dueDate);
    if (patch.assigneeName !== undefined) add('assignee_name', patch.assigneeName);
    if (patch.assigneeEmail !== undefined) add('assignee_email', patch.assigneeEmail);
    values.push(id);
    const sql = 'UPDATE em_action_items SET ' + sets.join(', ') + ', updated_at = NOW() WHERE id = $' + values.length + ' RETURNING *';
    const res = await this.pool.query(sql, values);
    return res.rows[0] ? mapActionItemRow(res.rows[0]) : null;
  }

  /** Return snoozed items whose time has come to PENDING. */
  async wakeSnoozedActionItems() {
    await this.ensureInitialized();
    const res = await this.pool.query(
      "UPDATE em_action_items SET status = 'PENDING', snoozed_until = NULL, updated_at = NOW() WHERE status = 'SNOOZED' AND snoozed_until <= NOW()",
    );
    return res.rowCount || 0;
  }

  /** Current state of the given items (used by the audit to respect dismiss/snooze). */
  async getActionItemsByIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    await this.ensureInitialized();
    const res = await this.pool.query('SELECT * FROM em_action_items WHERE id = ANY($1::text[])', [ids]);
    return res.rows.map(mapActionItemRow);
  }

  async updateActionItemStatus(id, { status = 'COMPLETED', resolutionNotes = '', completedBy = 'EM' } = {}) {
    const isDone = status === 'COMPLETED';
    const completedAt = isDone ? new Date().toISOString() : null;

    try {
      await this.ensureInitialized();
      const res = await this.pool.query(
        `
        UPDATE em_action_items
        SET status = $1, resolution_notes = $2, completed_by = $3,
            completed_at = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `,
        [status, resolutionNotes, isDone ? completedBy : null, completedAt, id]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
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
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    } catch (_e) { recordHandledError('db.postgres.updateActionItemStatus', _e); }

    const idx = this.inMemoryActionItems.findIndex((i) => i.id === id);
    if (idx >= 0) {
      this.inMemoryActionItems[idx] = {
        ...this.inMemoryActionItems[idx],
        status,
        resolutionNotes,
        completedBy: isDone ? completedBy : null,
        completedAt,
        updatedAt: new Date().toISOString(),
      };
      return this.inMemoryActionItems[idx];
    }
    return null;
  }

  async getActionItemsSummary() {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress,
          COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
          COUNT(*) FILTER (WHERE status = 'DISMISSED') as dismissed,
          COUNT(*) FILTER (WHERE status = 'PENDING' AND severity = 'CRITICAL') as critical_pending,
          COUNT(*) FILTER (WHERE status = 'PENDING' AND severity = 'WARNING') as warning_pending
        FROM em_action_items
      `);
      if (res.rows.length > 0) {
        const r = res.rows[0];
        return {
          total: Number(r.total || 0),
          pending: Number(r.pending || 0),
          inProgress: Number(r.in_progress || 0),
          completed: Number(r.completed || 0),
          dismissed: Number(r.dismissed || 0),
          criticalPending: Number(r.critical_pending || 0),
          warningPending: Number(r.warning_pending || 0),
        };
      }
    } catch (_e) { recordHandledError('db.postgres.getActionItemsSummary', _e); }

    const total = this.inMemoryActionItems.length;
    const pending = this.inMemoryActionItems.filter((i) => i.status === 'PENDING').length;
    const inProgress = this.inMemoryActionItems.filter((i) => i.status === 'IN_PROGRESS').length;
    const completed = this.inMemoryActionItems.filter((i) => i.status === 'COMPLETED').length;
    const dismissed = this.inMemoryActionItems.filter((i) => i.status === 'DISMISSED').length;
    const criticalPending = this.inMemoryActionItems.filter((i) => i.status === 'PENDING' && i.severity === 'CRITICAL').length;
    const warningPending = this.inMemoryActionItems.filter((i) => i.status === 'PENDING' && i.severity === 'WARNING').length;

    return {
      total,
      pending,
      inProgress,
      completed,
      dismissed,
      criticalPending,
      warningPending,
    };
  }
}

import express from 'express';
import databaseService from '../db/postgres.js';
import {
  startEmAutonomousAuditWorkflow,
  executeEmAutonomousAuditWorkflow,
  getWorkflowStatus,
} from '../temporal/client.js';
import { info, warn } from '../utils/logger.js';

const router = express.Router();

// GET /api/actions - List action items with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { status, category, severity, assignee, limit = 50, offset = 0 } = req.query;
    const items = await databaseService.listActionItems({
      status: status || 'ALL',
      category: category || 'ALL',
      severity: severity || 'ALL',
      assignee: assignee || null,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
    });
    const summary = await databaseService.getActionItemsSummary();

    res.json({
      success: true,
      count: items.length,
      summary,
      items,
    });
  } catch (err) {
    warn({ module: 'actionsRoute', action: 'listActionItemsError', err }, 'Failed to list action items');
    res.status(500).json({ success: false, error: err.message, items: [] });
  }
});

// GET /api/actions/summary - Aggregate counters
router.get('/summary', async (req, res) => {
  try {
    const summary = await databaseService.getActionItemsSummary();
    const latestAudit = await databaseService.getLatestAuditRun();
    res.json({
      success: true,
      summary,
      // No audit yet means no score, not a perfect one.
      healthScore: latestAudit?.healthScore ?? null,
      lastAuditAt: latestAudit?.createdAt || null,
      metrics: latestAudit
        ? {
            doraTier: latestAudit.doraSummary?.tier ?? null,
            deploymentFrequency: latestAudit.doraSummary?.deploymentFrequency ?? null,
            mttrHours: latestAudit.doraSummary?.mttrHours ?? null,
            openPrsCount: latestAudit.deliverySummary?.openPrsCount ?? null,
            stalledPrsCount: latestAudit.deliverySummary?.stalledPrsCount ?? null,
            avgPrReviewWaitHours: latestAudit.deliverySummary?.avgPrReviewWaitHours ?? null,
            overdue1on1sCount: latestAudit.peopleSummary?.overdue1on1sCount ?? null,
            sprintPacingPct: latestAudit.sprintOkrSummary?.sprintPacingPct ?? null,
            completedPoints: latestAudit.sprintOkrSummary?.completedPoints ?? null,
            totalPoints: latestAudit.sprintOkrSummary?.totalPoints ?? null,
            wipViolations: latestAudit.sprintOkrSummary?.wipViolations ?? null,
            sopComplianceScore: latestAudit.sopSummary?.complianceScore ?? null,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/actions/audit-runs - Historical audit run snapshots
router.get('/audit-runs', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const runs = await databaseService.listAuditRuns({
      limit: parseInt(limit, 10) || 20,
      offset: parseInt(offset, 10) || 0,
    });
    res.json({ success: true, count: runs.length, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, runs: [] });
  }
});

// GET /api/actions/audit-runs/:id - Get specific audit run
router.get('/audit-runs/:id', async (req, res) => {
  try {
    const run = await databaseService.getAuditRunById(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Audit run not found' });
    }
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/actions/sop/compliance - Get live SOP rules and compliance matrix
router.get('/sop/compliance', async (_req, res) => {
  try {
    const latestAudit = await databaseService.getLatestAuditRun();
    const stalledRaw = latestAudit?.deliverySummary?.stalledPrsCount;
    const stalled = Number.isFinite(Number(stalledRaw)) && stalledRaw !== null ? Number(stalledRaw) : null;
    const lastChecked = latestAudit?.createdAt || null;
    // Only the review SLA is measured (from the last audit's PR harvest). The other baseline rules
    // cannot be verified automatically and are reported as NOT_CHECKED, never as PASS.
    const rules = [
      {
        id: 'BASELINE-REVIEW-SLA',
        category: 'Code Review',
        title: 'PR code review turnaround SLA (<24h)',
        description: 'Pull requests receive review within 24 hours.',
        status: stalled === null ? 'NOT_CHECKED' : stalled > 0 ? 'WARN' : 'PASS',
        details: stalled === null ? 'No audit with pull request data yet' : `${stalled} stalled PR(s) in the last audit`,
        impact: 'Medium',
        lastChecked,
      },
      { id: 'BASELINE-DB-ISOLATION', category: 'Architecture', title: 'Database per-service isolation', description: 'One database per service; no cross-service joins.', status: 'NOT_CHECKED', details: 'Not automatically verifiable', impact: 'High', lastChecked: null },
      { id: 'BASELINE-SECURITY', category: 'Security', title: 'Secret masking policy', description: 'No plaintext secrets in code, logs or UI.', status: 'NOT_CHECKED', details: 'Not automatically verifiable', impact: 'Critical', lastChecked: null },
      { id: 'BASELINE-OBSERVABILITY', category: 'Observability', title: 'Non-blocking telemetry', description: 'Telemetry never blocks or fails user requests.', status: 'NOT_CHECKED', details: 'Not automatically verifiable', impact: 'High', lastChecked: null },
    ];

    const scored = rules.filter((r) => r.status !== 'NOT_CHECKED');
    const score = scored.length > 0 ? Math.round((scored.filter((r) => r.status === 'PASS').length / scored.length) * 100) : null;

    res.json({
      success: true,
      complianceScore: score,
      totalRules: rules.length,
      checkedRules: scored.length,
      rules,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/actions/:id - Mark completed, update status, add resolution notes
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes, completedBy } = req.body;
    const updated = await databaseService.updateActionItemStatus(id, {
      status,
      resolutionNotes,
      completedBy: completedBy || 'Engineering Manager',
    });

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Action item not found' });
    }

    info({ module: 'actionsRoute', action: 'updateActionItemStatus', id, status }, `Action item status updated to ${status}`);
    res.json({ success: true, item: updated });
  } catch (err) {
    warn({ module: 'actionsRoute', action: 'updateActionItemStatusError', err }, 'Failed to update action item');
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/actions/audit/trigger - Trigger immediate autonomous audit via Temporal or In-Process fallback
router.post('/audit/trigger', async (req, res) => {
  const { mode = 'consolidated', channel = null } = req.body || {};
  try {
    // 1. Try Temporal Durable Workflow
    const temporalRes = await startEmAutonomousAuditWorkflow({
      triggeredBy: 'ADMIN_MANUAL',
      slackMode: mode,
      slackChannel: channel,
    });

    if (temporalRes && temporalRes.workflowId) {
      return res.json({
        success: true,
        orchestrator: 'temporal',
        workflowId: temporalRes.workflowId,
        message: '⚡ Autonomous EM Audit dispatched to Temporal Durable Workflow!',
      });
    }

    // 2. In-process execution fallback
    const {
      harvestDoraAndDeliveryActivity,
      harvestPeopleAndCadenceActivity,
      harvestSprintAndOkrActivity,
      harvestSopAndGovernanceActivity,
      synthesizeAuditAndActionItemsActivity,
      dispatchSlackAuditNotificationActivity,
    } = await import('../temporal/activities.js');

    const [delivery, people, sprintOkr, sop] = await Promise.all([
      harvestDoraAndDeliveryActivity(),
      harvestPeopleAndCadenceActivity(),
      harvestSprintAndOkrActivity(),
      harvestSopAndGovernanceActivity(),
    ]);

    const synthesis = await synthesizeAuditAndActionItemsActivity({
      triggeredBy: 'ADMIN_MANUAL',
      harvestResults: { delivery, people, sprintOkr, sop },
    });

    await dispatchSlackAuditNotificationActivity({
      auditRun: synthesis.auditRun,
      topActions: synthesis.topActions,
      mode,
      channel,
    });

    res.json({
      success: true,
      orchestrator: 'in_process_fallback',
      auditRunId: synthesis.auditRun.id,
      healthScore: synthesis.auditRun.healthScore,
      actionItemsCount: synthesis.actionItems.length,
      message: '✅ Autonomous EM Audit executed successfully in-process!',
    });
  } catch (err) {
    warn({ module: 'actionsRoute', action: 'triggerAuditError', err }, 'Failed to trigger autonomous audit');
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/actions/audit/status/:workflowId - Poll Temporal workflow status
router.get('/audit/status/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const status = await getWorkflowStatus(workflowId);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/actions/slack/channels - List available Slack channels
router.get('/slack/channels', async (_req, res) => {
  try {
    const { listSlackChannelsWithStatus } = await import('../mcp/slack.js');
    const { channels, available, reason } = await listSlackChannelsWithStatus();
    res.json({ success: true, available, channels, ...(reason ? { reason } : {}) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, channels: [] });
  }
});

// POST /api/actions/slack/dispatch - Dispatch executive brief or custom summary to Slack
router.post('/slack/dispatch', async (req, res) => {
  try {
    const {
      channel = null,
      mode = 'consolidated',
      customNote = null,
      auditId = null,
    } = req.body || {};

    const {
      sendAuditOverviewMessage,
      sendAuditSubsectionThread,
    } = await import('../mcp/slack.js');

    const auditRun = auditId
      ? await databaseService.getAuditRunById(auditId)
      : await databaseService.getLatestAuditRun();

    if (!auditRun) {
      return res.status(404).json({ success: false, error: 'No audit run available to dispatch' });
    }

    const items = await databaseService.listActionItems({ status: 'PENDING', limit: 4 });
    const topActions = items.map((i) => ({
      title: i.title,
      category: i.category,
      severity: i.severity,
      assigneeName: i.assigneeName,
      suggestedAction: i.suggestedAction,
    }));

    const overviewRes = await sendAuditOverviewMessage({
      auditRun,
      topActions,
      channel,
    });

    let threadResults = [];
    if (mode === 'threaded_subsections' && overviewRes.ts) {
      threadResults = await sendAuditSubsectionThread({
        threadTs: overviewRes.ts,
        auditRun,
        channel,
      });
    }

    info({ module: 'actionsRoute', action: 'slackDispatch', channel, mode }, 'EM Executive Brief dispatched to Slack');
    res.json({
      success: true,
      mode,
      channel: overviewRes.targetChannel,
      overview: overviewRes,
      subsections: threadResults,
      message: `✅ EM Executive Brief dispatched to ${overviewRes.targetChannel || 'Slack'} successfully!`,
    });
  } catch (err) {
    warn({ module: 'actionsRoute', action: 'slackDispatchError', err }, 'Failed to dispatch to Slack');
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/actions/:id/nudge - Send direct Slack reminder to assigned engineer
router.post('/:id/nudge', async (req, res) => {
  try {
    const { id } = req.params;
    const { channel = null, customNote = null, sender = 'Engineering Manager' } = req.body || {};

    const actionItem = await databaseService.getActionItemById(id);
    if (!actionItem) {
      return res.status(404).json({ success: false, error: 'Action item not found' });
    }

    const { sendActionItemNudge } = await import('../mcp/slack.js');
    const nudgeRes = await sendActionItemNudge({
      actionItem,
      customNote,
      channel,
      sender,
    });

    info({ module: 'actionsRoute', action: 'sendActionItemNudge', id, assignee: actionItem.assigneeName }, 'Action item nudge sent');
    res.json({
      success: true,
      nudge: nudgeRes,
      message: `💬 Nudge sent for "${actionItem.title}" to ${nudgeRes.targetChannel || 'Slack'}!`,
    });
  } catch (err) {
    warn({ module: 'actionsRoute', action: 'sendActionItemNudgeError', err }, 'Failed to send action item nudge');
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/actions/batch - Batch update statuses or batch Slack operations
router.post('/batch', async (req, res) => {
  try {
    const { actionIds = [], operation = 'status_update', status = 'COMPLETED', resolutionNotes = null, completedBy = 'Engineering Manager' } = req.body || {};

    if (!Array.isArray(actionIds) || actionIds.length === 0) {
      return res.status(400).json({ success: false, error: 'actionIds array is required' });
    }

    const updatedItems = [];
    for (const id of actionIds) {
      if (operation === 'status_update') {
        const item = await databaseService.updateActionItemStatus(id, {
          status,
          resolutionNotes: resolutionNotes || `Batch updated to ${status}`,
          completedBy,
        });
        if (item) updatedItems.push(item);
      }
    }

    res.json({
      success: true,
      operation,
      updatedCount: updatedItems.length,
      items: updatedItems,
      message: `✅ Batch updated ${updatedItems.length} action items to ${status}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

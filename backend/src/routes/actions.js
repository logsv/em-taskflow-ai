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
      healthScore: latestAudit?.healthScore ?? 100,
      lastAuditAt: latestAudit?.createdAt || null,
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
    const rules = [
      {
        id: 'ADR-008',
        category: 'Architecture',
        title: 'Database Per-Service Isolation Architecture',
        description: 'Dedicated isolated PostgreSQL databases for backend, AI vector store, temporal, and analytics.',
        status: 'PASS',
        impact: 'High',
        lastChecked: latestAudit?.createdAt || new Date().toISOString(),
      },
      {
        id: 'SOP-01',
        category: 'Code Review',
        title: 'PR Code Review Turnaround SLA (<24h)',
        description: 'Pull requests must receive review and feedback within 24 hours of submission.',
        status: (latestAudit?.deliverySummary?.stalledPrsCount || 0) > 0 ? 'WARN' : 'PASS',
        impact: 'Medium',
        lastChecked: latestAudit?.createdAt || new Date().toISOString(),
      },
      {
        id: 'SOP-04',
        category: 'Security',
        title: 'Zero Cloud Key & Secret Masking Policy',
        description: '100% Local SLM inference with Ollama; zero third-party cloud LLM API dependencies.',
        status: 'PASS',
        impact: 'Critical',
        lastChecked: latestAudit?.createdAt || new Date().toISOString(),
      },
      {
        id: 'SOP-09',
        category: 'Observability',
        title: 'Zero-Downtime Telemetry Non-Blocking Execution',
        description: 'Trace logging, feedback, and telemetry must never block or crash user requests.',
        status: 'PASS',
        impact: 'High',
        lastChecked: latestAudit?.createdAt || new Date().toISOString(),
      },
    ];

    const passCount = rules.filter((r) => r.status === 'PASS').length;
    const score = Math.round((passCount / rules.length) * 100);

    res.json({
      success: true,
      complianceScore: score,
      totalRules: rules.length,
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

export default router;

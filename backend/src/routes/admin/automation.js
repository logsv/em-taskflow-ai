/**
 * Admin: Slack post approval (HITL) workflows and the autonomous audit.
 */
import express from 'express';
import databaseService from '../../db/postgres.js';
import { startSlackPostHITLWorkflow, signalSlackPostApproval, startEmAutonomousAuditWorkflow, getWorkflowStatus } from '../../temporal/client.js';
import { sendError } from '../../middleware/errorHandler.js';

const router = express.Router();

router.post('/temporal/slack-post/request', async (req, res) => {
  try {
    const { message, channel = '#engineering-retro', sprintName = 'Sprint 42', requestedBy = 'Admin Portal' } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'message parameter is required' });
    }

    const hitlRes = await startSlackPostHITLWorkflow({
      message,
      channel,
      sprintName,
      requestedBy,
    });

    res.json({
      success: true,
      workflowId: hitlRes?.workflowId,
      status: hitlRes?.status || 'PENDING_HUMAN_APPROVAL',
      orchestrator: hitlRes?.orchestrator || 'temporal',
      channel,
      message: 'Draft Slack post created and held in Temporal HITL workflow pending approval.',
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to initiate Temporal Slack post workflow');
  }
});

// POST /api/admin/temporal/slack-post/approve - Send Human Approval Signal
router.post('/temporal/slack-post/approve', async (req, res) => {
  try {
    const { workflowId, approver = 'Engineering Manager', modifiedMessage, targetChannel } = req.body || {};
    if (!workflowId) {
      return res.status(400).json({ error: 'workflowId parameter is required' });
    }

    const signalRes = await signalSlackPostApproval(workflowId, {
      approved: true,
      approver,
      modifiedMessage,
      targetChannel,
    });

    res.json({
      success: signalRes.signalSent !== false,
      message: `Human approval signal dispatched for workflow ${workflowId}`,
      workflowId,
      approved: true,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to send approval signal to Temporal workflow');
  }
});

// POST /api/admin/temporal/slack-post/reject - Send Human Rejection Signal
router.post('/temporal/slack-post/reject', async (req, res) => {
  try {
    const { workflowId, approver = 'Engineering Manager', reason = 'Rejected by reviewer' } = req.body || {};
    if (!workflowId) {
      return res.status(400).json({ error: 'workflowId parameter is required' });
    }

    const signalRes = await signalSlackPostApproval(workflowId, {
      approved: false,
      approver,
      reason,
    });

    res.json({
      success: signalRes.signalSent !== false,
      message: `Human rejection signal dispatched for workflow ${workflowId}`,
      workflowId,
      approved: false,
      reason,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to send rejection signal to Temporal workflow');
  }
});

// GET /api/admin/temporal/slack-post/status - Query Temporal Slack Post Workflow Status
router.get('/temporal/slack-post/status', async (req, res) => {
  try {
    const { workflowId } = req.query;
    if (!workflowId) {
      return res.status(400).json({ error: 'workflowId query parameter is required' });
    }

    const status = await getWorkflowStatus(workflowId);
    res.json({
      success: true,
      workflow: status,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to query Temporal Slack post workflow status');
  }
});

// POST /api/admin/audit/trigger - 1-Click Trigger Autonomous EM Audit
router.post('/audit/trigger', async (req, res) => {
  const { mode = 'consolidated', channel = null, notifySlack = false } = req.body || {};
  try {
    const temporalRes = await startEmAutonomousAuditWorkflow({
      triggeredBy: 'ADMIN_MANUAL',
      slackMode: mode,
      slackChannel: channel,
      notifySlack: notifySlack === true, // the owner asked for a Slack post with this run
    });

    if (temporalRes && temporalRes.workflowId) {
      return res.json({
        success: true,
        orchestrator: 'temporal',
        workflowId: temporalRes.workflowId,
        message: '⚡ Autonomous EM Audit dispatched to Temporal Durable Workflow!',
        requestId: req.requestId,
      });
    }

    // Fallback: in-process execution
    const {
      harvestDoraAndDeliveryActivity,
      harvestPeopleAndCadenceActivity,
      harvestSprintAndOkrActivity,
      harvestSopAndGovernanceActivity,
      synthesizeAuditAndActionItemsActivity,
      dispatchSlackAuditNotificationActivity,
    } = await import('../../temporal/activities.js');

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
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to trigger audit');
  }
});

// GET /api/admin/audit/status - Get latest audit health & history
router.get('/audit/status', async (req, res) => {
  try {
    const latestAudit = await databaseService.getLatestAuditRun();
    const summary = await databaseService.getActionItemsSummary();
    const runs = await databaseService.listAuditRuns({ limit: 5 });

    res.json({
      success: true,
      latestAudit,
      summary,
      recentRuns: runs,
      cronSchedule: '0 */4 * * * (Every 4 Hours)',
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to fetch audit status');
  }
});

export default router;

/**
 * Admin: team roster and roster sync.
 */
import express from 'express';
import databaseService from '../../db/postgres.js';
import identityService from '../../services/identityService.js';
import teamSyncWorker from '../../workers/teamSyncWorker.js';
import { sendError } from '../../middleware/errorHandler.js';

const router = express.Router();

router.get('/team', async (req, res) => {
  try {
    let members = await identityService.getAllMembers();
    if (members.length === 0) {
      // Auto-populate baseline on initial empty load
      const syncRes = await identityService.autoDiscoverAndSync();
      members = syncRes.members;
    }
    res.json({
      success: true,
      count: members.length,
      members,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to retrieve team members');
  }
});

// GET /api/admin/team/sync/status - Check background sync worker status
router.get('/team/sync/status', (req, res) => {
  res.json({
    success: true,
    worker: teamSyncWorker.getStatus(),
    requestId: req.requestId,
  });
});

// POST /api/admin/team/sync - 1-Click Parallel Auto-Discovery via Node.js Temporal Workflow (with fallback)
router.post('/team/sync', async (req, res) => {
  const startTime = Date.now();
  try {
    const { executeTeamDiscoveryWorkflow } = await import('../../temporal/client.js');
    const temporalRes = await executeTeamDiscoveryWorkflow();

    if (temporalRes && temporalRes.status === 'COMPLETED' && temporalRes.result) {
      const workflowResult = temporalRes.result;
      const durationMs = Date.now() - startTime;
      return res.json({
        success: true,
        workflowId: temporalRes.workflowId,
        runId: temporalRes.runId,
        executionMode: 'temporal',
        message: `Successfully auto-discovered and synchronized ${workflowResult.syncedCount} team member(s) across GitHub, Jira, Notion, and Google Calendar (4 Parallel Node.js Temporal Activities)`,
        syncedCount: workflowResult.syncedCount,
        syncedAt: new Date().toISOString(),
        durationMs,
        worker: {
          worker: 'Node.js Temporal Worker (team-sync-queue)',
          isRunning: false,
          lastRunAt: new Date().toISOString(),
          lastRunStatus: 'SUCCESS',
          workflowId: temporalRes.workflowId,
        },
        members: workflowResult.members,
        toolBreakdown: workflowResult.toolBreakdown,
        requestId: req.requestId,
      });
    }

    // Fallback to in-process Node.js TeamSyncWorker if Temporal server is not connected
    const syncRes = await teamSyncWorker.executeParallelSync();

    res.json({
      success: true,
      executionMode: 'in-process',
      message: `Successfully auto-discovered and synchronized ${syncRes.syncedCount} team member(s) across GitHub, Jira, Notion, and Google Calendar (4 Parallel Tool Activities)`,
      syncedCount: syncRes.syncedCount,
      syncedAt: syncRes.syncedAt,
      durationMs: syncRes.durationMs,
      worker: teamSyncWorker.getStatus(),
      members: syncRes.members,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to auto-discover team members');
  }
});

// POST /api/admin/team - Add team member manually
router.post('/team', async (req, res) => {
  try {
    const saved = await databaseService.upsertTeamMember(req.body || {});
    await identityService.getAllMembers();
    res.json({
      success: true,
      message: `Team member ${saved.displayName} saved successfully`,
      member: saved,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to add team member');
  }
});

// PUT /api/admin/team/:id - Update team member
router.put('/team/:id', async (req, res) => {
  try {
    const saved = await databaseService.upsertTeamMember({
      ...req.body,
      id: req.params.id,
    });
    await identityService.getAllMembers();
    res.json({
      success: true,
      message: `Team member ${saved.displayName} updated successfully`,
      member: saved,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to update team member');
  }
});

// DELETE /api/admin/team/:id - Remove team member
router.delete('/team/:id', async (req, res) => {
  try {
    await databaseService.deleteTeamMember(req.params.id);
    await identityService.getAllMembers();
    res.json({
      success: true,
      message: 'Team member deleted successfully',
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to delete team member');
  }
});

// POST /api/admin/temporal/slack-post/request - Initiate draft Slack post in Temporal HITL queue

export default router;

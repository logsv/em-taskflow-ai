import express from 'express';
import databaseService from '../../db/postgres.js';
import { sendError } from '../../middleware/errorHandler.js';
import { buildDoraResponse } from '../../domain/dora.js';

export { buildDoraResponse };
import { currentQuarter } from '../../utils/quarter.js';

const router = express.Router();

// GET /api/v1/em/dora - DORA metrics from stored snapshots (measured values only)
router.get('/em/dora', async (req, res) => {
  try {
    const teamId = req.query.team_id || null;
    // A database failure is an error, not "no data".
    const snapshots = await databaseService.getDoraSnapshots(teamId);
    res.json({ ...buildDoraResponse(snapshots, teamId), requestId: req.requestId });
  } catch (error) {
    return sendError(req, res, error, 'em.js');
  }
});

// GET /api/v1/em/sbi - Stored Situation-Behavior-Impact coaching records
router.get('/em/sbi', async (req, res) => {
  try {
    const engineerId = req.query.engineer_id || null;
    const records = await databaseService.getSbiRecords(engineerId);
    res.json({
      framework: 'Situation-Behavior-Impact',
      total_records: records.length,
      records,
      ...(records.length ? {} : { message: 'No SBI feedback recorded yet.' }),
      requestId: req.requestId,
    });
  } catch (error) {
    return sendError(req, res, error, 'em.js');
  }
});

// GET /api/v1/em/sprints - Stored sprint analytics (latest first, or ?sprint_id=)
router.get('/em/sprints', async (req, res) => {
  try {
    const sprintId = req.query.sprint_id || null;
    const sprints = await databaseService.getSprintAnalytics(sprintId);
    const active = Array.isArray(sprints) ? sprints[0] || null : (sprints?.sprint_id ? sprints : null);
    const committed = Number.isFinite(Number(active?.total_points)) ? Number(active.total_points) : null;
    const completed = Number.isFinite(Number(active?.completed_points)) ? Number(active.completed_points) : null;
    const wip = Number.isFinite(Number(active?.wip_violations)) ? Number(active.wip_violations) : null;
    res.json({
      measured: !!active,
      active_sprint: active?.sprint_id || null,
      committed_points: committed,
      completed_points: completed,
      wip_violations: wip,
      velocity_completion_pct: committed && completed !== null ? Math.round((completed / committed) * 100) : null,
      health: !active ? null : wip > 0 ? 'AT_RISK' : 'ON_TRACK',
      retro_action_items: Array.isArray(active?.retro_action_items) ? active.retro_action_items : [],
      ...(active ? {} : { message: 'No sprint analytics stored yet. Run a team sync with Jira connected.' }),
      requestId: req.requestId,
    });
  } catch (error) {
    return sendError(req, res, error, 'em.js');
  }
});

// GET /api/v1/em/okrs - Stored OKR records for a quarter (?quarter=Q3, default: current quarter)
router.get('/em/okrs', async (req, res) => {
  try {
    const quarter = req.query.quarter || currentQuarter();
    const okrs = await databaseService.getOkrRecords(quarter);
    const progress = okrs
      .map((o) => (Number(o.target_value) > 0 ? Math.min(100, (Number(o.current_value) / Number(o.target_value)) * 100) : null))
      .filter((v) => v !== null && Number.isFinite(v));
    res.json({
      quarter,
      measured: okrs.length > 0,
      overall_completion_pct: progress.length ? Math.round(progress.reduce((a, v) => a + v, 0) / progress.length) : null,
      objectives: okrs,
      ...(okrs.length ? {} : { message: `No OKRs stored for ${quarter}. Add them in the Admin portal or via the OKR capability.` }),
      requestId: req.requestId,
    });
  } catch (error) {
    return sendError(req, res, error, 'em.js');
  }
});

export default router;

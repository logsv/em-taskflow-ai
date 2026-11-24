import express from 'express';
import healthApplicationService from '../../application/health/HealthApplicationService.js';
import { sendError } from '../../middleware/errorHandler.js';
import { getReadiness } from '../../application/health/readiness.js';

const router = express.Router();

// GET /api/v1/health - System health, DB connection, and LLM readiness
router.get('/health', async (req, res) => {
  try {
    const responsePayload = await healthApplicationService.getHealth({
      requestId: req.requestId,
    });
    res.json(responsePayload);
  } catch (error) {
    return sendError(req, res, error, 'health.js');
  }
});

// GET /api/v1/health/ready - Per-dependency readiness (503 when a required dependency is down)
router.get('/health/ready', async (req, res) => {
  try {
    const readiness = await getReadiness();
    // Public endpoint: report status per dependency without internal error details.
    const dependencies = Object.fromEntries(Object.entries(readiness.dependencies).map(([k, v]) => [k, { status: v.status }]));
    res.status(readiness.ready ? 200 : 503).json({ ...readiness, dependencies, requestId: req.requestId });
  } catch (error) {
    return sendError(req, res, error, 'health.ready');
  }
});

export default router;

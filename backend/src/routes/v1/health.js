import express from 'express';
import healthApplicationService from '../../application/health/HealthApplicationService.js';
import { sendError } from '../../middleware/errorHandler.js';

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

export default router;

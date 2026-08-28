import express from 'express';
import healthApplicationService from '../../application/health/HealthApplicationService.js';

const router = express.Router();

// GET /api/v1/health - System health, DB connection, and LLM readiness
router.get('/health', async (req, res) => {
  try {
    const responsePayload = await healthApplicationService.getHealth({
      requestId: req.requestId,
    });
    res.json(responsePayload);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      requestId: req.requestId,
    });
  }
});

export default router;

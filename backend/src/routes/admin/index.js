/**
 * Admin API (/api/admin, /api/v1/admin). One module per area; evaluation tooling is mounted
 * only with ENABLE_DEV_EVAL_ROUTES=true. When it is off, /eval/* answers 404 with a code that
 * says how to enable it, and /system-status reports features.devEvalRoutes=false so the UI
 * hides the tab.
 */
import express from 'express';
import { getFeaturesConfig } from '../../config.js';
import systemRoutes from './system.js';
import evalRoutes from './eval.js';
import documentRoutes from './documents.js';
import settingsRoutes from './settings.js';
import teamRoutes from './team.js';
import automationRoutes from './automation.js';

const router = express.Router();

router.use(systemRoutes);
router.use(documentRoutes);
router.use(settingsRoutes);
router.use(teamRoutes);
router.use(automationRoutes);

router.use('/eval', (req, res, next) => {
  if (getFeaturesConfig()?.devEvalRoutes) return next();
  return res.status(404).json({
    code: 'FEATURE_DISABLED',
    error: 'Evaluation tooling is a developer feature. Set ENABLE_DEV_EVAL_ROUTES=true to enable it, or use the npm run eval:* scripts.',
    requestId: req.requestId,
  });
});
router.use(evalRoutes);

export default router;

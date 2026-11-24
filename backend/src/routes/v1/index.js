import express from 'express';
import healthRouter from './health.js';
import sessionsRouter from './sessions.js';
import chatRouter from './chat.js';
import emRouter from './em.js';
import actionsRouter from '../actions.js';
import adminRouter from '../admin.js';
import ragRouter from '../rag.js';
import uploadRouter from '../upload.js';
import docsRouter from '../docs.js';
import authRouter from './auth.js';
import { requireOwner } from '../../middleware/auth.js';
import {
  startJiraOAuthFlow,
  completeJiraOAuthFlow,
  getJiraOAuthStatus,
  disconnectJiraOAuth,
} from '../../mcp/jiraOAuth.js';
import { sendError } from '../../middleware/errorHandler.js';
import { renderPrometheus } from '../../core/metrics.js';
import { getReadiness } from '../../application/health/readiness.js';

const router = express.Router();

// Attach API Version header to all v1 responses
router.use((req, res, next) => {
  res.setHeader('X-API-Version', 'v1');
  next();
});

// ---- Public routes (no owner auth) ----
router.use('/', healthRouter);
router.use('/', authRouter);

// The OAuth callback is a top-level redirect from Atlassian: SameSite=Strict cookies are
// not sent on it, so it must stay public. It only accepts a one-time authorization code.
router.get('/mcp/jira/oauth/callback', async (req, res) => {
  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send(`<h3>Error: Missing authorization code from Atlassian OAuth callback</h3><p><a href="${frontendBase}/admin?tab=settings">Back to Admin</a></p>`);
    }
    await completeJiraOAuthFlow(code);
    res.redirect(`${frontendBase}/admin?tab=settings&jira_oauth=success`);
  } catch (error) {
    res.status(500).send(`<h3>Atlassian OAuth could not be completed.</h3><p><a href="${frontendBase}/admin?tab=settings">Back to Admin Settings</a></p>`);
  }
});

// ---- Everything below requires the owner ----
router.use(requireOwner);

router.use('/', sessionsRouter);
router.use('/', chatRouter);
router.use('/', emRouter);

// Atlassian Jira OAuth 2.0 (3LO) Endpoints
router.get('/mcp/jira/oauth/start', async (req, res) => {
  try {
    const result = await startJiraOAuthFlow();
    res.json({ success: true, ...result });
  } catch (error) {
    return sendError(req, res, error, 'index.js');
  }
});

router.get('/mcp/jira/oauth/status', async (req, res) => {
  try {
    const status = await getJiraOAuthStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    return sendError(req, res, error, 'index.js');
  }
});

router.post('/mcp/jira/oauth/disconnect', async (req, res) => {
  try {
    const result = await disconnectJiraOAuth();
    res.json({ success: true, ...result });
  } catch (error) {
    return sendError(req, res, error, 'index.js');
  }
});

// Mount feature sub-routers
// Metrics and full readiness detail (owner only)
router.get('/metrics', (req, res) => {
  res.type('text/plain; version=0.0.4').send(renderPrometheus());
});
router.get('/health/ready/details', async (req, res) => {
  try {
    const readiness = await getReadiness();
    res.status(readiness.ready ? 200 : 503).json({ ...readiness, requestId: req.requestId });
  } catch (error) {
    return sendError(req, res, error, 'health.ready.details');
  }
});

router.use('/rag', ragRouter);
router.use('/chat/upload', uploadRouter);
router.use('/admin', adminRouter);
router.use('/docs', docsRouter);
router.use('/actions', actionsRouter);

export default router;

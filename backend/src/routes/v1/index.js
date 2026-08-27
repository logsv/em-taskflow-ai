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
import {
  startJiraOAuthFlow,
  completeJiraOAuthFlow,
  getJiraOAuthStatus,
  disconnectJiraOAuth,
} from '../../mcp/jiraOAuth.js';

const router = express.Router();

// Attach API Version header to all v1 responses
router.use((req, res, next) => {
  res.setHeader('X-API-Version', 'v1');
  next();
});

// Mount domain sub-routers
router.use('/', healthRouter);
router.use('/', sessionsRouter);
router.use('/', chatRouter);
router.use('/', emRouter);

// Atlassian Jira OAuth 2.0 (3LO) Endpoints
router.get('/mcp/jira/oauth/start', async (req, res) => {
  try {
    const result = await startJiraOAuthFlow();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    res.status(500).send(`<h3>Atlassian OAuth Notice: ${error.message}</h3><p><a href="${frontendBase}/admin?tab=settings">Back to Admin Settings</a></p>`);
  }
});

router.get('/mcp/jira/oauth/status', async (req, res) => {
  try {
    const status = await getJiraOAuthStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/mcp/jira/oauth/disconnect', async (req, res) => {
  try {
    const result = await disconnectJiraOAuth();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mount feature sub-routers
router.use('/rag', ragRouter);
router.use('/chat/upload', uploadRouter);
router.use('/admin', adminRouter);
router.use('/docs', docsRouter);
router.use('/actions', actionsRouter);

export default router;

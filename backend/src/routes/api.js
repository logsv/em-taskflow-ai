import express from 'express';
import { z } from 'zod';
import ragRouter from './rag.js';
import { getApiConfig } from '../config.js';
import { createLegacyEndpointGate } from './legacyRouteGate.js';
import { attachSessionContext } from '../middleware/sessionContext.js';
import chatApplicationService from '../application/chat/ChatApplicationService.js';
import feedbackApplicationService from '../application/feedback/FeedbackApplicationService.js';
import conversationApplicationService from '../application/conversation/ConversationApplicationService.js';
import healthApplicationService from '../application/health/HealthApplicationService.js';
import {
  completeNotionOAuthFlow,
  resetNotionOAuthState,
} from '../mcp/notionOAuth.js';
import {
  completeGithubOAuthFlow,
  resetGithubOAuthState,
} from '../mcp/githubOAuth.js';

const router = express.Router();
const legacyApiConfig = getApiConfig().legacy;
const requireLegacyRouterMetricsApi = createLegacyEndpointGate({
  enabled: legacyApiConfig.routerMetrics.enabled,
  replacement: '/api/health',
});
const requireLegacyQueryApi = createLegacyEndpointGate({
  enabled: legacyApiConfig.query.enabled,
  replacement: '/api/chat',
});
const requireLegacyThreadsApi = createLegacyEndpointGate({
  enabled: legacyApiConfig.threads.enabled,
  replacement: '/api/session',
});

const querySchema = z.object({
  query: z.string().min(1).max(20_000),
  threadId: z.string().min(1).max(128).nullable().optional(),
  mode: z.enum(['baseline', 'advanced']).optional(),
});

const chatSchema = z.object({
  message: z.string().min(1).max(20_000),
  threadId: z.string().min(1).max(128).nullable().optional(),
  mode: z.enum(['baseline', 'advanced']).optional(),
});

const feedbackSchema = z.object({
  messageId: z.coerce.number().int().positive().optional(),
  threadId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(256).optional(),
  score: z.enum(['thumbs_up', 'thumbs_down']),
  comment: z.string().trim().max(2_000).optional(),
});

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

router.get('/router/metrics', requireLegacyRouterMetricsApi, async (req, res) => {
  try {
    const responsePayload = await healthApplicationService.getRouterMetrics({
      requestId: req.requestId,
    });
    res.json(responsePayload);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch router metrics',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/session', attachSessionContext, async (req, res) => {
  try {
    res.json({
      sessionId: req.sessionContext.sessionId,
      threadId: req.sessionContext.threadId,
      created: !!req.sessionContext.created,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to resolve session',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.post('/chat', attachSessionContext, async (req, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        requestId: req.requestId,
      });
    }

    const responsePayload = await chatApplicationService.processChat({
      message: parsed.data.message,
      threadId: parsed.data.threadId,
      sessionContext: req.sessionContext,
      requestId: req.requestId,
      ragMode: parsed.data.mode === 'advanced' ? 'advanced' : 'baseline',
    });
    res.json(responsePayload);
  } catch (error) {
    const message = error?.message || 'Failed to process query';
    const status = message.includes('timed out')
      ? 504
      : message.includes('LLM unavailable')
        ? 503
        : 500;
    res.status(status).json({
      error: message,
      requestId: req.requestId,
    });
  }
});

router.post('/query', requireLegacyQueryApi, attachSessionContext, async (req, res) => {
  try {
    const parsed = querySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        requestId: req.requestId,
      });
    }

    const responsePayload = await chatApplicationService.processChat({
      message: parsed.data.query,
      threadId: parsed.data.threadId,
      sessionContext: req.sessionContext,
      requestId: req.requestId,
      ragMode: 'baseline',
    });
    res.json(responsePayload);
  } catch (error) {
    const message = error?.message || 'Failed to process query';
    const status = message.includes('timed out')
      ? 504
      : message.includes('LLM unavailable')
        ? 503
        : 500;
    res.status(status).json({
      error: message,
      requestId: req.requestId,
    });
  }
});

router.post('/feedback', attachSessionContext, async (req, res) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        requestId: req.requestId,
      });
    }

    const responsePayload = await feedbackApplicationService.submitFeedback({
      payload: parsed.data,
      sessionContext: req.sessionContext,
      requestId: req.requestId,
    });
    res.status(201).json(responsePayload);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to capture feedback',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/threads', requireLegacyThreadsApi, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const responsePayload = await conversationApplicationService.listThreads({
      limit,
      requestId: req.requestId,
    });
    res.json(responsePayload);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list threads',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/threads/:threadId/messages', requireLegacyThreadsApi, async (req, res) => {
  try {
    const { threadId } = req.params;
    const limit = Number(req.query.limit || 100);
    const responsePayload = await conversationApplicationService.getThreadMessages({
      threadId,
      requestId: req.requestId,
      limit,
    });
    res.json(responsePayload);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch thread messages',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/mcp/notion/oauth/start', async (req, res) => {
  try {
    const result = await startNotionOAuthFlow();
    if (result.authorizationUrl) {
      return res.json({
        ...result,
        requestId: req.requestId,
      });
    }
    return res.json({
      ...result,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to start Notion OAuth flow',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/mcp/notion/oauth/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  try {
    const result = await completeNotionOAuthFlow(code);
    return res.status(200).send(
      `<html><body><h3>Notion OAuth complete</h3><p>Status: ${result.status}</p><p>Loaded tools: ${result.toolCount}</p><p>You can return to the app.</p></body></html>`,
    );
  } catch (error) {
    return res.status(500).send(
      `<html><body><h3>Notion OAuth failed</h3><pre>${error.message}</pre></body></html>`,
    );
  }
});

router.get('/mcp/notion/oauth/status', async (req, res) => {
  try {
    const status = await getNotionOAuthStatus();
    return res.json({
      ...status,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch Notion OAuth status',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.post('/mcp/notion/oauth/reset', async (req, res) => {
  try {
    const result = await resetNotionOAuthState();
    return res.json({
      ...result,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to reset Notion OAuth state',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/mcp/github/oauth/start', async (req, res) => {
  try {
    const result = await startGithubOAuthFlow();
    return res.json({
      ...result,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to start GitHub OAuth flow',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/mcp/github/oauth/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  try {
    const result = await completeGithubOAuthFlow(code);
    return res.status(200).send(
      `<html><body><h3>GitHub OAuth complete</h3><p>Status: ${result.status}</p><p>Loaded tools: ${result.toolCount}</p><p>You can return to the app.</p></body></html>`,
    );
  } catch (error) {
    return res.status(500).send(
      `<html><body><h3>GitHub OAuth failed</h3><pre>${error.message}</pre></body></html>`,
    );
  }
});

router.get('/mcp/github/oauth/status', async (req, res) => {
  try {
    const status = await getGithubOAuthStatus();
    return res.json({
      ...status,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch GitHub OAuth status',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.post('/mcp/github/oauth/reset', async (req, res) => {
  try {
    const result = await resetGithubOAuthState();
    return res.json({
      ...result,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to reset GitHub OAuth state',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.use('/rag', ragRouter);

export default router;

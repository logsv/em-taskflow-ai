import express from 'express';
import { z } from 'zod';
import ragRouter from './rag.js';
import db from '../db/index.js';
import agentService from '../services/agentService.js';
import { getRuntimeConfig } from '../config.js';
import { attachSessionContext } from '../middleware/sessionContext.js';
import {
  startNotionOAuthFlow,
  completeNotionOAuthFlow,
  getNotionOAuthStatus,
  resetNotionOAuthState,
} from '../mcp/notionOAuth.js';
import {
  startGithubOAuthFlow,
  completeGithubOAuthFlow,
  getGithubOAuthStatus,
  resetGithubOAuthState,
} from '../mcp/githubOAuth.js';

const router = express.Router();

const querySchema = z.object({
  query: z.string().min(1).max(20_000),
  threadId: z.string().min(1).max(128).nullable().optional(),
  mode: z.enum(['baseline', 'advanced']).optional(),
});

const chatSchema = z.object({
  message: z.string().min(1).max(20_000),
  threadId: z.string().min(1).max(128).nullable().optional(),
});

const feedbackSchema = z.object({
  messageId: z.coerce.number().int().positive().optional(),
  threadId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(256).optional(),
  score: z.enum(['thumbs_up', 'thumbs_down']),
  comment: z.string().trim().max(2_000).optional(),
});

async function handleChatRequest(req, res, payload) {
  const { message, threadId } = payload;
  const query = message;
  const ensuredThread = await db.ensureThread(
    threadId || req.sessionContext?.threadId || undefined,
    query.slice(0, 80),
    req.sessionContext?.sessionId || null,
  );
  const result = await agentService.processQuery(query, {
    threadId: ensuredThread.id,
    ragMode: 'baseline',
  });
  let notionOAuth = null;
  let githubOAuth = null;
  let notionOauthStartError = null;
  try {
    let oauthStatus = await getNotionOAuthStatus();
    if (!oauthStatus?.authorized && !oauthStatus?.pendingAuthorizationUrl) {
      await startNotionOAuthFlow().catch((error) => {
        notionOauthStartError = error?.message || String(error);
        return null;
      });
      oauthStatus = await getNotionOAuthStatus();
    }
    if (oauthStatus?.pendingAuthorizationUrl && !oauthStatus?.authorized) {
      notionOAuth = {
        required: true,
        authorizationUrl: oauthStatus.pendingAuthorizationUrl,
      };
    }
  } catch (error) {
    notionOAuth = null;
  }
  let githubOauthStartError = null;
  try {
    let oauthStatus = await getGithubOAuthStatus();
    if (!oauthStatus?.authorized && !oauthStatus?.pendingAuthorizationUrl) {
      await startGithubOAuthFlow().catch((error) => {
        githubOauthStartError = error?.message || String(error);
        return null;
      });
      oauthStatus = await getGithubOAuthStatus();
    }
    if (oauthStatus?.pendingAuthorizationUrl && !oauthStatus?.authorized) {
      githubOAuth = {
        required: true,
        authorizationUrl: oauthStatus.pendingAuthorizationUrl,
      };
    } else if (!oauthStatus?.authorized && githubOauthStartError) {
      githubOAuth = {
        required: true,
        authorizationUrl: null,
        error: githubOauthStartError,
      };
    }
  } catch (error) {
    githubOAuth = null;
  }

  const routedDomains = Array.isArray(result?.meta?.decision?.routingPlan?.domains)
    ? result.meta.decision.routingPlan.domains
    : [];
  const githubIntent = routedDomains.includes('github');
  const notionIntent = routedDomains.includes('notion');
  if (githubIntent && githubOAuth?.required) {
    result.answer = githubOAuth.authorizationUrl
      ? 'GitHub connection is required before I can fetch your repositories/issues/PRs. Use the Connect GitHub link in chat, then retry your query.'
      : `GitHub connection is required before I can fetch your repositories/issues/PRs. ${githubOAuth.error || 'Complete GitHub OAuth setup and retry.'}`;
  } else if (notionIntent && notionOAuth?.required) {
    result.answer = 'Notion connection is required before I can fetch workspace insights. Use the Connect Notion link in chat, then retry your query.';
  } else if (notionIntent && notionOauthStartError && !notionOAuth?.required) {
    result.answer = `Notion connection is required before I can fetch workspace insights. ${notionOauthStartError}`;
  }

  const decision = result.meta?.decision || {};
  const userMessageRecord = await db.saveMessage({
    threadId: ensuredThread.id,
    role: 'user',
    content: query,
    strategy: decision.selectedPath || null,
    executorPath: decision.selectedPath || null,
    traceId: result.meta?.traceId || null,
    metadata: decision,
  });
  const assistantMessageRecord = await db.saveMessage({
    threadId: ensuredThread.id,
    role: 'assistant',
    content: result.answer,
    strategy: decision.selectedPath || null,
    executorPath: decision.selectedPath || null,
    traceId: result.meta?.traceId || null,
    citations: Array.isArray(result.sources)
      ? result.sources.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        }))
      : [],
    metadata: {
      ...decision,
      userMessageId: userMessageRecord.id,
      sourceCount: Array.isArray(result.sources) ? result.sources.length : 0,
    },
  });

  res.json({
    messageId: assistantMessageRecord.id,
    threadId: ensuredThread.id,
    sessionId: req.sessionContext?.sessionId || null,
    answer: result.answer,
    sources: result.sources.map((doc) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
    })),
    traceId: result.meta?.traceId || null,
    feedbackToken: assistantMessageRecord.id,
    meta: {
      ...(result.meta || {}),
      ...(notionOAuth ? { notionOAuth } : {}),
      ...(githubOAuth ? { githubOAuth } : {}),
    },
    requestId: req.requestId,
  });
}

router.get('/health', async (req, res) => {
  try {
    const runtimeConfig = getRuntimeConfig();
    const agentStatus = await agentService.getStatus().catch(() => ({
      ready: false,
      mcpReady: false,
      ragEnabled: false,
    }));

    res.json({
      status: 'healthy',
      runtimeMode: runtimeConfig.mode,
      services: {
        database: 'healthy',
        agent: agentStatus.ready ? 'healthy' : 'degraded',
        mcp: agentStatus.mcpReady ? 'healthy' : 'degraded',
        rag: agentStatus.ragEnabled ? 'healthy' : 'degraded',
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/router/metrics', async (req, res) => {
  try {
    const status = await agentService.getStatus();
    res.json({
      runtimeMode: status.runtimeMode,
      router: status.router || null,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
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

    await handleChatRequest(req, res, parsed.data);
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

router.post('/query', attachSessionContext, async (req, res) => {
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

    await handleChatRequest(req, res, {
      message: parsed.data.query,
      threadId: parsed.data.threadId,
    });
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

    const { messageId, threadId, traceId, score, comment } = parsed.data;
    const feedback = await db.createFeedback({
      sessionId: req.sessionContext?.sessionId || null,
      threadId: threadId || req.sessionContext?.threadId || null,
      messageId: messageId || null,
      traceId: traceId || null,
      score,
      comment: comment || null,
      metadata: {
        requestId: req.requestId,
      },
    });

    res.status(201).json({
      status: 'success',
      feedbackId: feedback.id,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to capture feedback',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/threads', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const threads = await db.listThreads(limit);
    res.json({
      threads,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list threads',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const limit = Number(req.query.limit || 100);
    const messages = await db.getThreadMessages(threadId, limit);
    res.json({
      threadId,
      messages,
      requestId: req.requestId,
    });
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

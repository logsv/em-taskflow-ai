import express from 'express';
import { z } from 'zod';
import ragRouter from './rag.js';
import db from '../db/index.js';
import agentService from '../services/agentService.js';
import { getRuntimeConfig } from '../config.js';

const router = express.Router();

const querySchema = z.object({
  query: z.string().min(1).max(20_000),
  threadId: z.string().min(1).max(128).optional(),
  mode: z.enum(['baseline', 'advanced']).optional(),
});

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

router.post('/query', async (req, res) => {
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

    const { query, threadId, mode } = parsed.data;
    const ensuredThread = await db.ensureThread(threadId, query.slice(0, 80));
    const result = await agentService.processQuery(query, {
      threadId: ensuredThread.id,
      ragMode: mode || 'baseline',
    });

    const decision = result.meta?.decision || {};
    await db.saveMessage({
      threadId: ensuredThread.id,
      role: 'user',
      content: query,
      strategy: decision.selectedPath || null,
      executorPath: decision.selectedPath || null,
      metadata: decision,
    });
    await db.saveMessage({
      threadId: ensuredThread.id,
      role: 'assistant',
      content: result.answer,
      strategy: decision.selectedPath || null,
      executorPath: decision.selectedPath || null,
      metadata: {
        ...decision,
        sourceCount: Array.isArray(result.sources) ? result.sources.length : 0,
      },
    });

    res.json({
      threadId: ensuredThread.id,
      answer: result.answer,
      sources: result.sources.map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
      meta: result.meta,
      requestId: req.requestId,
    });
  } catch (error) {
    const message = error?.message || 'Failed to process query';
    const status = message.includes('timed out') ? 504 : 500;
    res.status(status).json({
      error: message,
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

router.use('/rag', ragRouter);

export default router;

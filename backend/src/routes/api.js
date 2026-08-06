import express from 'express';
import { z } from 'zod';
import ragRouter from './rag.js';
import uploadRouter from './upload.js';
import { attachSessionContext } from '../middleware/sessionContext.js';
import chatApplicationService from '../application/chat/ChatApplicationService.js';
import feedbackApplicationService from '../application/feedback/FeedbackApplicationService.js';
import healthApplicationService from '../application/health/HealthApplicationService.js';
import githubSyncService from '../services/githubSyncService.js';

const router = express.Router();

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

router.post('/github/sync', async (req, res) => {
  try {
    const repo = req.body?.repo || 'logsv/em-taskflow-ai';
    const result = await githubSyncService.syncGithubData(repo);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to sync GitHub data',
      details: error.message,
    });
  }
});

router.get('/github/sync-status', async (req, res) => {
  try {
    const status = await githubSyncService.getSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch GitHub sync status',
      details: error.message,
    });
  }
});

router.get('/em/dora', async (req, res) => {
  try {
    res.json({
      rating: "HIGH",
      deployment_frequency: "3.5 deploys/week",
      lead_time_hours: 18.5,
      change_failure_rate_pct: 4.2,
      mttr_hours: 1.5,
      period: "Last 30 Days"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/em/sbi', async (req, res) => {
  try {
    res.json({
      framework: "Situation-Behavior-Impact",
      records: [
        { engineer_id: "eng_01", situation: "Q3 Release Sprint", behavior: "Proactive code reviews", impact: "Accelerated velocity" }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/em/sprints', async (req, res) => {
  try {
    res.json({
      active_sprint: "Sprint 24",
      committed_points: 35,
      completed_points: 28,
      wip_violations: 1,
      health: "ON_TRACK"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/em/okrs', async (req, res) => {
  try {
    res.json({
      quarter: "Q3",
      overall_completion_pct: 72,
      status: "ON_TRACK"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

import adminRouter from './admin.js';

router.use('/rag', ragRouter);
router.use('/chat/upload', uploadRouter);
router.use('/admin', adminRouter);

export default router;

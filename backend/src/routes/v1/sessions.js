import express from 'express';
import { attachSessionContext } from '../../middleware/sessionContext.js';
import databaseService from '../../db/postgres.js';

const router = express.Router();

// GET /api/v1/session - Resolve active session context and messages
router.get('/session', attachSessionContext, async (req, res) => {
  try {
    const threadId = req.sessionContext?.threadId;
    const messages = threadId ? await databaseService.getThreadMessages(threadId, 100).catch(() => []) : [];
    res.json({
      sessionId: req.sessionContext.sessionId,
      threadId: req.sessionContext.threadId,
      created: !!req.sessionContext.created,
      messages: Array.isArray(messages) ? messages : [],
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

// GET /api/v1/sessions - List paginated sessions
router.get('/sessions', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const result = await databaseService.listSessions({ page, limit });
    res.json({
      success: true,
      sessions: result.sessions,
      pagination: result.pagination,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list sessions',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// POST /api/v1/sessions - Create new session and initial thread
router.post('/sessions', async (req, res) => {
  try {
    const clientInfo = {
      ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
    };
    const newSession = await databaseService.createSession(clientInfo);
    const title = req.body?.title || 'New Chat';
    const newThread = await databaseService.createThreadForSession(newSession.id, title);
    await databaseService.setActiveThread(newSession.id, newThread.id).catch(() => {});

    res.status(201).json({
      success: true,
      sessionId: newSession.id,
      threadId: newThread.id,
      title: newThread.title,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create session',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// GET /api/v1/sessions/:sessionId/threads - List threads for a session
router.get('/sessions/:sessionId/threads', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const result = await databaseService.listThreadsForSession(sessionId, { page, limit });
    res.json({
      success: true,
      sessionId,
      threads: result.threads,
      pagination: result.pagination,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list threads for session',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// POST /api/v1/sessions/:sessionId/switch - Switch active thread in session
router.post('/sessions/:sessionId/switch', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const threadId = req.body?.threadId;
    if (!threadId) {
      return res.status(400).json({
        error: 'threadId is required to switch thread',
        requestId: req.requestId,
      });
    }
    await databaseService.ensureThread(threadId, 'Chat', sessionId);
    await databaseService.setActiveThread(sessionId, threadId);
    const messages = await databaseService.getThreadMessages(threadId, 100).catch(() => []);
    res.json({
      success: true,
      sessionId,
      threadId,
      messages: Array.isArray(messages) ? messages : [],
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to switch active thread',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// DELETE /api/v1/sessions/:sessionId - Delete session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await databaseService.deleteSession(sessionId);
    res.json({ success: true, deleted: true, sessionId, requestId: req.requestId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session', details: error.message, requestId: req.requestId });
  }
});

// PATCH /api/v1/sessions/:sessionId/archive - Archive session
router.patch('/sessions/:sessionId/archive', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await databaseService.archiveSession(sessionId);
    res.json({ success: true, archived: true, sessionId, requestId: req.requestId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive session', details: error.message, requestId: req.requestId });
  }
});

// POST /api/v1/threads - Create new thread for session
router.post('/threads', attachSessionContext, async (req, res) => {
  try {
    const title = req.body?.title || 'New Chat';
    const sessionId = req.sessionContext?.sessionId || null;
    const newThread = await databaseService.createThreadForSession(sessionId, title);
    if (sessionId && newThread?.id) {
      await databaseService.setActiveThread(sessionId, newThread.id).catch(() => {});
    }
    res.status(201).json({
      success: true,
      threadId: newThread.id,
      title: newThread.title,
      sessionId,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create thread',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// GET /api/v1/threads/:threadId/messages - Get messages in thread
router.get('/threads/:threadId/messages', attachSessionContext, async (req, res) => {
  try {
    const threadId = req.params.threadId;
    const limit = Number(req.query.limit) || 100;
    const messages = await databaseService.getThreadMessages(threadId, limit).catch(() => []);
    res.json({
      threadId,
      messages: Array.isArray(messages) ? messages : [],
      count: messages.length,
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

export default router;

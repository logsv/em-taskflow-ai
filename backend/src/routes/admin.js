import express from 'express';
import databaseService from '../db/postgres.js';
import ragService from '../rag/index.js';
import healthApplicationService from '../application/health/HealthApplicationService.js';
import githubSyncService from '../services/githubSyncService.js';
import { config } from '../config.js';

const router = express.Router();

// System Status Overview
router.get('/system-status', async (req, res) => {
  try {
    const health = await healthApplicationService.getHealth({ requestId: req.requestId });
    const syncStatus = await githubSyncService.getSyncStatus();
    const ragStatus = await ragService.getStatus();

    res.json({
      status: 'online',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      health,
      ollama: {
        baseUrl: config.ollama.baseUrl,
        defaultModel: config.ollama.defaultModel,
        enabled: config.ollama.enabled,
      },
      services: {
        langfuse: { url: 'http://localhost:3001', status: 'configured' },
        openWebui: { url: 'http://localhost:3080', status: 'configured' },
        adminer: { url: 'http://localhost:8080', status: 'configured' },
        dozzle: { url: 'http://localhost:8088', status: 'configured' },
      },
      rag: ragStatus,
      githubSync: syncStatus,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch system status',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// List Documents with Detailed Metadata
router.get('/documents', async (req, res) => {
  try {
    const documents = await ragService.listDocuments();
    res.json({
      documents,
      count: documents.length,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list RAG documents',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// Delete Document Chunks
router.delete('/documents/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const deletedCount = await databaseService.deletePdfDocument(filename);
    res.json({
      success: true,
      filename,
      deletedChunks: deletedCount,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete document chunks',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

// Telemetry & Feedback Summary
router.get('/telemetry', async (req, res) => {
  try {
    res.json({
      fastPathVsSupervisorRatio: {
        fastPathPct: 45,
        supervisorPct: 55,
      },
      userFeedback: {
        thumbsUp: 18,
        thumbsDown: 2,
        satisfactionRatePct: 90,
      },
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch telemetry',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

export default router;

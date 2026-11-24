/**
 * Admin: system status, data reset and cache controls.
 */
import express from 'express';
import http from 'http';
import https from 'https';
import ragService from '../../rag/index.js';
import healthApplicationService from '../../application/health/HealthApplicationService.js';
import githubSyncService from '../../services/githubSyncService.js';
import { config, getFeaturesConfig } from '../../config.js';
import { l1ExactCache } from '../../cache/l1ExactCache.js';
import { getSemanticCacheStats } from '../../cache/semanticCache.js';
import { cacheInvalidator } from '../../cache/cacheInvalidator.js';
import { DEFAULT_CHAT_MODEL } from '../../llm/models.js';
import { sendError } from '../../middleware/errorHandler.js';

const router = express.Router();

/**
 * Helper to probe HTTP status of a service with strict timeout.
 */
async function probeService(targetUrl, timeoutMs = 600) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname || '/',
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode < 500 ? 'online' : 'offline');
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve('offline');
      });
      req.on('error', () => resolve('offline'));
      req.end();
    } catch (_err) {
      resolve('offline');
    }
  });
}

// System Status Overview with live service probing
router.get('/system-status', async (req, res) => {
  try {
    const health = await healthApplicationService.getHealth({ requestId: req.requestId });
    const syncStatus = await githubSyncService.getSyncStatus();
    const ragStatus = await ragService.getStatus();

    const services = {
      langfuse: { url: 'http://localhost:3001', probeUrl: 'http://langfuse:3000', name: 'Langfuse Traces & Evals', description: 'Central Observability, Traces & LLM Evaluation Dashboard' },
      promptfoo: { url: 'https://www.promptfoo.app', probeUrl: 'https://www.promptfoo.app', name: 'Promptfoo Managed Cloud', description: 'Promptfoo Managed Cloud & Evaluation Hub (emtaskflow-ai)', isCloud: true, status: 'not_checked' },
      temporal: { url: 'http://localhost:8233', probeUrl: 'http://temporal-ui:8080', name: 'Temporal Web UI', description: 'Durable Workflow Execution Dashboard' },
      adminer: { url: 'http://localhost:8080', probeUrl: 'http://adminer:8080', name: 'Adminer DB Manager', description: 'PostgreSQL Database Explorer' },
    };

    // Probe status concurrently (trying internal container URL first, then external host URL)
    await Promise.all(
      Object.keys(services).map(async (key) => {
        if (services[key].isCloud) {
          // External SaaS: not probed from here, so its status is not claimed.
          services[key].status = 'not_checked';
          return;
        }
        let status = await probeService(services[key].probeUrl);
        if (status === 'offline') {
          status = await probeService(services[key].url);
        }
        services[key].status = status;
      })
    );

    res.json({
      status: 'online',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      health,
      ollama: {
        baseUrl: config.llm?.providers?.ollama?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        defaultModel: config.llm?.defaultModel || process.env.LLM_DEFAULT_MODEL || DEFAULT_CHAT_MODEL,
        enabled: config.llm?.providers?.ollama?.enabled ?? true,
      },
      services,
      features: { devEvalRoutes: !!getFeaturesConfig()?.devEvalRoutes },
      rag: ragStatus,
      githubSync: syncStatus,
      requestId: req.requestId,
    });
  } catch (error) {
    return sendError(req, res, error, 'Failed to fetch system status');
  }
});


// POST /api/admin/system/reset-data - Safely reset application and cache tables while preserving app_settings
router.post('/system/reset-data', async (req, res) => {
  try {
    const { cleanupDatabaseTables } = await import('../../db/dbCleanup.js');
    const { preserveSettings = true } = req.body || {};

    const result = await cleanupDatabaseTables({ preserveSettings });

    res.json({
      success: true,
      message: '✅ Database tables cleared successfully. Tool configurations and settings were preserved.',
      result,
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to reset database tables');
  }
});

// GET /api/admin/cache/stats - Multi-tier cache statistics
router.get('/cache/stats', async (req, res) => {
  try {
    const l1Stats = l1ExactCache.getStats();
    const l2Stats = getSemanticCacheStats();

    res.json({
      success: true,
      tiers: {
        l1_exact_in_memory: l1Stats,
        l2_semantic_redis: l2Stats,
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  } catch (err) {
    return sendError(req, res, err, 'Failed to fetch cache statistics');
  }
});

// POST /api/admin/cache/flush - Targeted or full cache flush
router.post('/cache/flush', async (req, res) => {
  try {
    const { domain, documentFilename, all = false } = req.body || {};

    if (all || (!domain && !documentFilename)) {
      await cacheInvalidator.invalidateAll();
      return res.json({
        success: true,
        message: '✅ Flushed all cache tiers (L1 exact, L2 semantic, Tier 2 MCP tool cache)',
        flushed: 'all',
        requestId: req.requestId,
      });
    }

    if (documentFilename) {
      const docResult = await cacheInvalidator.invalidateDocument(documentFilename);
      return res.json({
        success: true,
        message: `✅ Flushed document cache entries for: ${documentFilename}`,
        result: docResult,
        requestId: req.requestId,
      });
    }

    if (domain) {
      const domainResult = await cacheInvalidator.invalidateDomain(domain);
      return res.json({
        success: true,
        message: `✅ Flushed domain cache entries for: ${domain}`,
        result: domainResult,
        requestId: req.requestId,
      });
    }
  } catch (err) {
    return sendError(req, res, err, 'Failed to flush cache');
  }
});

export default router;

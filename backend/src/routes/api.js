import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import langGraphAgentService from '../agent/index.js';
import ragService from '../rag/index.js';
import { isMCPReady } from '../mcp/index.js';
import storageRouter from './storage.js';
import agentRouter from './agent.js';
import ragRouter from './rag.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const pdfDir = path.join(__dirname, '../../data/pdfs/');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
const upload = multer({ dest: pdfDir });

router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📄 Processing uploaded PDF:', req.file.originalname);

    const result = await ragService.processPDF(req.file.path, req.file.originalname || 'unknown.pdf');

    if (result.success) {
      res.json({
        status: 'success',
        message: `PDF processed successfully. Created ${result.chunks} chunks.`,
        chunks: result.chunks,
        filename: req.file.originalname,
      });
    } else {
      res.status(500).json({
        error: 'Failed to process PDF',
        details: result.error,
      });
    }
  } catch (err) {
    console.error('❌ PDF upload error:', err);
    res.status(500).json({ error: 'Failed to process PDF upload' });
  }
});



router.post('/llm-summary', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const agentResponse = await withTimeout(
      langGraphAgentService.processQuery(prompt),
      45_000,
      'Request timed out after 45 seconds',
    );

    res.json({
      response: agentResponse,
      message: 'Response generated using integrated RAG, MCP, and LLM agent',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in /llm-summary:', error);
    const message = error.message || 'Unknown error';
    const status = message.includes('timed out') ? 504 : 500;
    res.status(status).json({ error: message });
  }
});


router.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      services: {
        database: 'healthy',
        langGraphAgent: langGraphAgentService.isReady() ? 'healthy' : 'initializing',
        mcpService: isMCPReady() ? 'healthy' : 'initializing',
      },
      timestamp: new Date().toISOString(),
    };

    res.json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      message: `Health check failed: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/llm-status', async (req, res) => {
  try {
    const agentStatus = await langGraphAgentService.getStatus();

    res.json({
      status: 'success',
      data: {
        agent: agentStatus,
        model: config.llm.defaultModel,
        provider: config.llm.defaultProvider,
        initialized: langGraphAgentService.isReady(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('LLM status error:', error);
    res.status(500).json({
      status: 'error',
      message: `Failed to get LLM status: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/llm-test', async (req, res) => {
  try {
    const { prompt = 'Hello, world!' } = req.body;

    const startTime = Date.now();
    const response = await langGraphAgentService.processQuery(prompt, {
      maxIterations: 5,
    });
    const endTime = Date.now();

    res.json({
      status: 'success',
        data: {
          response,
          model: config.llm.defaultModel,
          provider: config.llm.defaultProvider,
          responseTime: endTime - startTime,
        },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('LLM test error:', error);
    res.status(500).json({
      status: 'error',
      message: `LLM test failed: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});



router.get('/rag-debug', async (req, res) => {
  try {
    console.log('🔍 RAG Debug endpoint called');
    const ragStatus = await ragService.getStatus();

    res.json({
      ragStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('RAG Debug error:', error);
    res.status(500).json({ error: 'RAG Debug failed', message: error.message });
  }
});



router.use('/agent', agentRouter);
router.use('/rag', ragRouter);
router.use('/storage', storageRouter);

export default router;

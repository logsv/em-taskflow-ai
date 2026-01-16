import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import langGraphAgentService from '../agent/index.js';
import ragService from '../rag/index.js';
import { isMCPReady } from '../mcp/index.js';
import storageRouter from './storage.js';
import agentRouter from './agent.js';
import agenticRagRouter from './agenticRag.js';
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

router.post('/rag-query', async (req, res) => {
  try {
    const { query, top_k = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('🔍 Processing RAG query with integrated agent:', query);

    try {
      const agentResponse = await withTimeout(
        langGraphAgentService.processQuery(query),
        120_000,
        'Request timed out after 120 seconds',
      );

      const apology = 'I apologize, but I encountered an error while generating a response.';
      if (agentResponse && typeof agentResponse === 'string' && agentResponse.startsWith(apology)) {
        console.warn('Primary agent returned apology text, switching to RAG+LLM fallback');
        throw new Error('primary-returned-apology');
      }

      return res.json({
        answer: agentResponse,
        message: 'Response generated using integrated RAG, MCP, and LLM agent',
        query,
        timestamp: new Date().toISOString(),
      });
    } catch (primaryError) {
      console.warn('Primary agent flow failed, attempting direct RAG fallback:', primaryError.message);

      const topK = typeof req.body?.top_k === 'number' ? req.body.top_k : 5;
      const ragResults = await ragService.searchRelevantChunks(query, topK);
      const context = ragResults.context || 'No relevant context found.';

      const prompt = `Use the following document context to answer the question. If context is empty, answer from general knowledge but state that no matching document context was found.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;

      try {
        const baseUrl = config.llm.providers.ollama.baseUrl;
        const model = config.llm.defaultModel || 'llama3.2:latest';

        console.log('RAG fallback using model:', model);

        const genResp = await axios.post(
          `${baseUrl}/api/generate`,
          {
            model,
            prompt,
            stream: false,
          },
          { timeout: 30_000 },
        );
        const text = genResp.data?.response || '';
        return res.json({
          answer: text || 'No response generated.',
          message: 'Response generated via direct RAG + local LLM fallback',
          query,
          model,
          timestamp: new Date().toISOString(),
        });
      } catch (fallbackError) {
        console.error('Direct RAG fallback failed:', fallbackError);
        const msg = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
        const status = msg.includes('timed out') ? 504 : 500;
        return res.status(status).json({
          error: msg.includes('timed out')
            ? 'Request timed out after 45 seconds'
            : msg,
        });
      }
    }
  } catch (err) {
    console.error('❌ RAG query error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('timed out') ? 504 : 500;
    console.error('❌ RAG Error details:', msg);
    console.error('❌ RAG Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    res.status(status).json({
      error: msg.includes('timed out') ? 'Request timed out after 45 seconds' : 'Failed to process RAG query',
    });
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
router.use('/agentic-rag', agenticRagRouter);
router.use('/storage', storageRouter);

export default router;

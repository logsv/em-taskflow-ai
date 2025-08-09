import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
// import pdfParse from 'pdf-parse'; // Temporarily disabled due to module issues
import axios from 'axios';
import { fileURLToPath } from 'url';
import taskManager from '../services/taskManager.js';
import getMCPRouter from '../services/newLlmRouter.js';
import mcpLlmService from '../services/mcpLlmService.js';
import langGraphAgentService from '../services/langGraphAgentService.js';
import ragService from '../services/ragService.js';
import databaseService from '../services/databaseService.js';
import mcpService from '../services/mcpService.js';
import databaseRouter from './database.js';
import { config } from '../config/index.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Simple timeout helper for endpoint operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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

// Type definitions
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

interface CompleteTaskRequest extends Request {
  body: {
    taskType: string;
    taskId: string;
    note: string;
  };
}

interface LLMSummaryRequest extends Request {
  body: {
    prompt: string;
    sessionId?: string;
  };
}

interface RAGQueryRequest extends Request {
  body: {
    query: string;
    top_k?: number;
  };
}

interface SuggestionsRequest extends Request {
  query: {
    sessionId?: string;
  };
}

// Ensure PDF storage directory exists
const pdfDir = path.join(__dirname, '../../data/pdfs/');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
const upload = multer({ dest: pdfDir });

// PDF Upload Endpoint - Now uses RAG service
router.post('/upload-pdf', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log('📄 Processing uploaded PDF:', req.file.originalname);
    
    // Use RAG service to process the PDF
    const result = await ragService.processPDF(req.file.path, req.file.originalname || 'unknown.pdf');
    
    if (result.success) {
      res.json({ 
        status: 'success', 
        message: `PDF processed successfully. Created ${result.chunks} chunks.`,
        chunks: result.chunks,
        filename: req.file.originalname
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to process PDF',
        details: result.error
      });
    }
  } catch (err) {
    console.error('❌ PDF upload error:', err);
    res.status(500).json({ error: 'Failed to process PDF upload' });
  }
});

// GET /api/summary - Unified status summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { jiraTasks, notionPages, calendarEvents, calendarConflicts } = await taskManager.fetchAllStatus();
    // Fetch Notion page updates for each page
    const pageUpdates: Record<string, string[]> = {};
    if (notionPages) {
      for (const page of notionPages) {
        pageUpdates[page.id] = await taskManager.summarizePageUpdates(page.id);
      }
    }
    res.json({
      jira: jiraTasks,
      notion: notionPages,
      notionUpdates: pageUpdates,
      calendar: calendarEvents,
      calendarConflicts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary.' });
  }
});

// POST /api/complete - Mark a task as complete
router.post('/complete', async (req: CompleteTaskRequest, res: Response) => {
  const { taskType, taskId, note } = req.body;
  if (!taskType || !taskId || !note) {
    return res.status(400).json({ error: 'taskType, taskId, and note are required.' });
  }
  try {
    const result = await taskManager.markTaskComplete(taskId);
    res.json({ success: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark task complete.' });
  }
});

// GET /api/suggestions - LLM-powered smart suggestions
router.get('/suggestions', async (req: SuggestionsRequest, res: Response) => {
  try {
    const { sessionId } = req.query;
    // Smart suggestions temporarily disabled - using placeholder
    const suggestions = ['Review pending tasks', 'Check calendar conflicts', 'Update project status'];
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate suggestions.' });
  }
});

// POST /api/llm-summary - Process user queries with LangGraph Agent
router.post('/llm-summary', async (req: LLMSummaryRequest, res: Response) => {
  try {
    const { prompt, sessionId } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Process query with integrated RAG+MCP+Agent service with 45s timeout
    const agentResponse = await withTimeout(
      langGraphAgentService.processQuery(prompt),
      45_000,
      'Request timed out after 45 seconds'
    );
    
    // agentResponse is now a string (the response itself)
    // Save chat interaction to database (already handled in processQuery)
    
    res.json({ 
      response: agentResponse,
      message: 'Response generated using integrated RAG, MCP, and LLM agent',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /llm-summary:', error);
    const message = (error as Error).message || 'Unknown error';
    const status = message.includes('timed out') ? 504 : 500;
    res.status(status).json({ error: message });
  }
});

// POST /api/rag-query - Process user queries with integrated RAG+MCP+Agent flow
router.post('/rag-query', async (req: RAGQueryRequest, res: Response) => {
  try {
    const { query, top_k = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('🔍 Processing RAG query with integrated agent:', query);

    try {
      // Primary: unified agent service (RAG + MCP + LLM) with 120s timeout
      const agentResponse = await withTimeout(
        langGraphAgentService.processQuery(query),
        120_000,
        'Request timed out after 120 seconds'
      );

      // If the agent responded with a generic error/apology, fall back to direct RAG + local LLM
      const apology = 'I apologize, but I encountered an error while generating a response.';
      if (typeof agentResponse === 'string' && agentResponse.startsWith(apology)) {
        console.warn('Primary agent returned apology text, switching to RAG+LLM fallback');
        throw new Error('primary-returned-apology');
      }

      return res.json({
        answer: agentResponse,
        message: 'Response generated using integrated RAG, MCP, and LLM agent',
        query: query,
        timestamp: new Date().toISOString()
      });
    } catch (primaryError) {
      console.warn('Primary agent flow failed, attempting direct RAG fallback:', (primaryError as Error).message);

      // Fallback: direct RAG search + local LLM (Ollama) without MCP
      const topK = typeof req.body?.top_k === 'number' ? req.body.top_k : 5;
      const ragResults = await ragService.searchRelevantChunks(query, topK);
      const context = ragResults.context || 'No relevant context found.';

      const prompt = `Use the following document context to answer the question. If context is empty, answer from general knowledge but state that no matching document context was found.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;

      try {
        const baseUrl = config.llm.providers.ollama.baseUrl;
        const genResp = await axios.post(`${baseUrl}/api/generate`, {
          model: 'mistral:latest',
          prompt,
          stream: false
        }, { timeout: 30_000 });
        const text: string = genResp.data?.response || '';
        return res.json({
          answer: text || 'No response generated.',
          message: 'Response generated via direct RAG + local LLM fallback',
          query: query,
          timestamp: new Date().toISOString()
        });
      } catch (fallbackError) {
        console.error('Direct RAG fallback failed:', fallbackError);
        const msg = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
        const status = msg.includes('timed out') ? 504 : 500;
        return res.status(status).json({ error: msg.includes('timed out') ? 'Request timed out after 45 seconds' : 'Failed to process RAG query' });
      }
    }
  } catch (err) {
    console.error('❌ RAG query error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('timed out') ? 504 : 500;
    console.error('❌ RAG Error details:', msg);
    console.error('❌ RAG Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    res.status(status).json({ error: msg.includes('timed out') ? 'Request timed out after 45 seconds' : 'Failed to process RAG query' });
  }
});

// GET /api/health - Enhanced LLM service health check
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Initialize enhanced LLM service if not already initialized
    if (!mcpLlmService.isInitialized()) {
      await mcpLlmService.initialize();
    }

    const healthStatus = await mcpLlmService.healthCheck();
    
    res.status(healthStatus.status === 'healthy' ? 200 : 503).json({
      status: healthStatus.status,
      message: healthStatus.message,
      providers: healthStatus.providers,
      timestamp: new Date().toISOString(),
      service: 'Enhanced LLM Service with Router'
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      message: `Health check failed: ${(error as Error).message}`,
      providers: {},
      timestamp: new Date().toISOString(),
      service: 'Enhanced LLM Service with Router'
    });
  }
});

// GET /api/llm-status - Get detailed LLM provider status
router.get('/llm-status', async (req: Request, res: Response) => {
  try {
    // Initialize enhanced LLM service if not already initialized
    if (!mcpLlmService.isInitialized()) {
      await mcpLlmService.initialize();
    }

    const providerStatus = mcpLlmService.getProviderStatus();
    const availableModels = mcpLlmService.getAvailableModels();
    const availableProviders = mcpLlmService.getAvailableProviders();

    res.json({
      status: 'success',
      data: {
        providers: providerStatus,
        availableModels,
        availableProviders,
        initialized: mcpLlmService.isInitialized()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('LLM status error:', error);
    res.status(500).json({
      status: 'error',
      message: `Failed to get LLM status: ${(error as Error).message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/llm-test - Test LLM functionality with different providers
router.post('/llm-test', async (req: Request, res: Response) => {
  try {
    const { prompt = 'Hello, world!', model, preferredProviders, ...options } = req.body;

    // Initialize enhanced LLM service if not already initialized
    if (!mcpLlmService.isInitialized()) {
      await mcpLlmService.initialize();
    }

    const startTime = Date.now();
    const response = await mcpLlmService.completeWithMetadata(prompt, {
      model,
      preferredProviders,
      ...options
    });
    const endTime = Date.now();

    res.json({
      status: 'success',
      data: {
        response: response.text,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        metadata: response.metadata,
        responseTime: endTime - startTime
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('LLM test error:', error);
    res.status(500).json({
      status: 'error',
      message: `LLM test failed: ${(error as Error).message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mcp-status - MCP service status check
router.get('/mcp-status', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Checking MCP service status...');
    
    // Get MCP server status (tools are discovered automatically by the agent)
    const serverStatus = await mcpService.getServerStatus();
    
    res.json({
      status: 'success',
      message: 'MCP status retrieved successfully - tools discovered automatically by agent',
      servers: serverStatus,
      initialized: mcpService.isReady(),
      agentReady: mcpService.getAgent() !== null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('MCP status error:', error);
    res.status(500).json({
      status: 'error', 
      message: `Failed to get MCP status: ${(error as Error).message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/mcp-restart - Force restart MCP service (DEBUG endpoint)
router.post('/mcp-restart', async (req: Request, res: Response) => {
  try {
    console.log('🔧 DEBUG - Force restarting MCP service...');
    await (mcpService as any).forceRestart();
    
    // Get updated status
    const serverStatus = await mcpService.getServerStatus();
    
    res.json({
      status: 'success',
      message: 'MCP service force restarted successfully - tools will be discovered by agent',
      servers: serverStatus,
      initialized: mcpService.isReady(),
      agentReady: mcpService.getAgent() !== null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('MCP restart error:', error);
    res.status(500).json({
      status: 'error',
      message: `Failed to restart MCP service: ${(error as Error).message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// DEBUG: Simple MCP test endpoint
router.get('/mcp-debug', async (req: Request, res: Response) => {
  try {
    console.log('🔍 MCP Debug endpoint called');
    const isReady = mcpService.isReady();
    const agent = mcpService.getAgent();
    const status = await mcpService.getServerStatus();
    
    res.json({
      ready: isReady,
      agentAvailable: !!agent,
      serverStatus: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('MCP Debug error:', error);
    res.status(500).json({ error: 'MCP Debug failed', message: (error as Error).message });
  }
});

// DEBUG: Simple RAG test endpoint
router.get('/rag-debug', async (req: Request, res: Response) => {
  try {
    console.log('🔍 RAG Debug endpoint called');
    const ragStatus = await ragService.getStatus();
    
    res.json({
      ragStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('RAG Debug error:', error);
    res.status(500).json({ error: 'RAG Debug failed', message: (error as Error).message });
  }
});

// DEBUG: Test MCP runQuery directly
router.post('/mcp-test', async (req: Request, res: Response) => {
  try {
    console.log('🔍 MCP Test endpoint called');
    const query = req.body.query || "list my notion pages";
    
    if (!mcpService.isReady()) {
      await mcpService.initialize();
    }
    
    console.log('🧪 Testing MCP runQuery with:', query);
    const result = await mcpService.runQuery(query, 10);
    console.log('✅ MCP runQuery completed');
    
    res.json({
      query,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('MCP Test error:', error);
    res.status(500).json({ error: 'MCP Test failed', message: (error as Error).message });
  }
});

// Note: MCP tools are integrated into the agent service and used automatically
// in RAG queries (/api/rag-query and /api/llm-summary). No separate CRUD endpoints needed.

// Database routes
router.use('/database', databaseRouter);

export default router;

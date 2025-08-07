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
import agentService from '../services/agentService.js';
import ragService from '../services/ragService.js';
import databaseService from '../services/databaseService.js';
import mcpService from '../services/mcpService.js';
import databaseRouter from './database.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
    
    // Process query with integrated RAG+MCP+Agent service
    const agentResponse = await agentService.processQuery(prompt);
    
    // agentResponse is now a string (the response itself)
    // Save chat interaction to database (already handled in processQuery)
    
    res.json({ 
      response: agentResponse,
      message: 'Response generated using integrated RAG, MCP, and LLM agent',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /llm-summary:', error);
    res.status(500).json({ error: (error as Error).message });
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

    // Use the unified agent service which includes RAG, MCP, and LLM integration
    const agentResponse = await agentService.processQuery(query);

    res.json({
      answer: agentResponse,
      message: 'Response generated using integrated RAG, MCP, and LLM agent',
      query: query,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ RAG query error:', err);
    console.error('❌ RAG Error details:', err instanceof Error ? err.message : 'Unknown error');
    console.error('❌ RAG Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    res.status(500).json({ error: 'Failed to process RAG query' });
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
// Note: MCP tools are integrated into the agent service and used automatically
// in RAG queries (/api/rag-query and /api/llm-summary). No separate CRUD endpoints needed.

// Database routes
router.use('/database', databaseRouter);

export default router;

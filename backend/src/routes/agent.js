import express from 'express';
import langGraphAgentService from '../agent/service.js';
import { checkAgentReadiness, getAgentTools } from '../agent/graph.js';

const router = express.Router();

// Simple timeout helper for agent operations
function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * POST /api/agent/query - Execute a query using LangGraph ReAct agent
 */
router.post('/query', async (req, res) => {
  try {
    const { query, maxIterations, includeRAG } = req.body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Query is required and must be a non-empty string',
      });
    }
    
    console.log('🤖 LangGraph agent query received:', query.slice(0, 100));
    
    // Process query with timeout (2 minutes)
    const result = await withTimeout(
      langGraphAgentService.processQuery(query.trim(), {
        maxIterations: maxIterations || 10,
        includeRAG: includeRAG !== false, // Default to true
      }),
      120_000,
      'LangGraph agent query timed out after 2 minutes'
    );
    
    res.json({
      status: 'success',
      data: result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('LangGraph agent query error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/agent/stream - Stream a query response for real-time interaction
 */
router.post('/stream', async (req, res) => {
  try {
    const { query, maxIterations, includeRAG } = req.body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Query is required and must be a non-empty string',
      });
    }
    
    console.log('🌊 LangGraph agent streaming query:', query.slice(0, 100));
    
    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      message: 'Starting LangGraph agent processing...',
    })}\n\n`);
    
    try {
      const streamGenerator = langGraphAgentService.streamQuery(query.trim(), {
        maxIterations: maxIterations || 10,
        includeRAG: includeRAG !== false,
      });
      
      for await (const chunk of streamGenerator) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      
      // Send completion message
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        message: 'Query processing completed',
      })}\n\n`);
      
    } catch (streamError) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: streamError.message,
      })}\n\n`);
    }
    
    res.end();
    
  } catch (error) {
    console.error('LangGraph agent streaming error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
});

/**
 * GET /api/agent/status - Get LangGraph agent status
 */
router.get('/status', async (req, res) => {
  try {
    console.log('🔍 Checking LangGraph agent status...');
    
    const status = await langGraphAgentService.getStatus();
    const readiness = await checkAgentReadiness();
    
    res.json({
      status: 'success',
      data: {
        ...status,
        readiness,
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('LangGraph agent status error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/agent/tools - Get available MCP tools
 */
router.get('/tools', async (req, res) => {
  try {
    console.log('🔧 Getting available MCP tools...');
    
    const tools = await langGraphAgentService.getAvailableTools();
    const { toolInfo } = await getAgentTools();
    
    res.json({
      status: 'success',
      data: {
        tools,
        toolInfo,
        count: tools.length,
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('Get tools error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/agent/restart - Restart the LangGraph agent service
 */
router.post('/restart', async (req, res) => {
  try {
    console.log('🔄 Restarting LangGraph agent service...');
    
    await langGraphAgentService.restart();
    
    const status = await langGraphAgentService.getStatus();
    
    res.json({
      status: 'success',
      message: 'LangGraph agent service restarted successfully',
      data: status,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('LangGraph agent restart error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/agent/health - Health check for the agent system
 */
router.get('/health', async (req, res) => {
  try {
    const [serviceStatus, readiness] = await Promise.all([
      langGraphAgentService.getStatus(),
      checkAgentReadiness(),
    ]);
    
    const healthy = serviceStatus.ready && readiness.ready;
    
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      data: {
        service: serviceStatus,
        readiness,
        healthy,
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('LangGraph agent health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

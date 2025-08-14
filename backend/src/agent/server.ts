/**
 * Agent Server - HTTP routes to agent graph execution
 * Handles HTTP API routes and delegates to the agent graph
 */

import express from 'express';
import type { Request, Response } from 'express';
import { executeAgentQuery, checkAgentReadiness, getAgentTools } from './graph.js';
import { agenticRetrieve } from '../rag/index.js';
import { getChatOllama } from '../llm/index.js';

const router = express.Router();

// Timeout helper
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

/**
 * POST /query - Main agent query endpoint
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, maxIterations = 10, includeRAG = true } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required and must be a string' });
    }

    console.log('🤖 Processing agent query:', query.slice(0, 100) + '...');

    let enhancedQuery = query;
    let ragContext = null;

    // Step 1: Enhance with RAG context if requested
    if (includeRAG) {
      try {
        console.log('📚 Adding RAG context...');
        const ragResult = await agenticRetrieve(query, {
          enableQueryRewriting: true,
          enableReranking: true,
          enableCompression: true,
          topK: 6,
        });

        if (ragResult.sources.length > 0) {
          ragContext = {
            answer: ragResult.answer,
            sources: ragResult.sources.length,
            executionTime: ragResult.executionTime,
          };

          // Enhance query with RAG context
          const contextText = ragResult.sources
            .map(doc => doc.pageContent)
            .join('\n\n');

          enhancedQuery = `Context from documents:
${contextText}

User question: ${query}

Please answer using the provided context when relevant, and use your available tools for additional information if needed.`;

          console.log(`✅ Added RAG context from ${ragResult.sources.length} sources`);
        }
      } catch (ragError) {
        console.warn('⚠️ RAG enhancement failed:', ragError);
        // Continue without RAG
      }
    }

    // Step 2: Execute agent query
    const agentResponse = await withTimeout(
      executeAgentQuery(enhancedQuery, { maxIterations }),
      120_000, // 2 minutes
      'Agent query timed out after 2 minutes'
    );

    res.json({
      response: agentResponse,
      metadata: {
        originalQuery: query,
        enhancedQuery: enhancedQuery !== query,
        ragContext,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('❌ Agent query failed:', error);
    const message = (error as Error).message;
    const status = message.includes('timed out') ? 504 : 500;
    
    res.status(status).json({
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /stream - Streaming agent query endpoint
 */
router.post('/stream', async (req: Request, res: Response) => {
  try {
    const { query, maxIterations = 10 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required and must be a string' });
    }

    console.log('🌊 Starting streaming agent query...');

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (type: string, data: any) => {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Execute streaming agent query
      const stream = await executeAgentQuery(query, {
        maxIterations,
        stream: true,
      }) as AsyncIterable<any>;

      sendEvent('start', { message: 'Starting agent processing...' });

      for await (const chunk of stream) {
        if (chunk.agent) {
          sendEvent('thinking', {
            content: 'Agent is reasoning...',
            data: chunk.agent,
          });
        } else if (chunk.tools) {
          sendEvent('tool_use', {
            content: 'Using tools...',
            data: chunk.tools,
          });
        }
      }

      sendEvent('complete', { message: 'Query processing completed' });

    } catch (error) {
      sendEvent('error', {
        message: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }

    res.end();

  } catch (error) {
    console.error('❌ Streaming agent query failed:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /status - Agent status endpoint
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const readiness = await checkAgentReadiness();
    const { tools, toolInfo } = await getAgentTools();

    res.json({
      ready: readiness.ready,
      model: readiness.model,
      toolCount: readiness.toolCount,
      tools: toolInfo.map(tool => ({
        name: tool.name,
        description: tool.description,
      })),
      error: readiness.error,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Agent status check failed:', error);
    res.status(500).json({
      ready: false,
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /tools - Available tools endpoint
 */
router.get('/tools', async (req: Request, res: Response) => {
  try {
    const { toolInfo } = await getAgentTools();

    res.json({
      tools: toolInfo,
      count: toolInfo.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Failed to get tools:', error);
    res.status(500).json({
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /test - Test agent with simple query
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { prompt = 'Hello, how are you?' } = req.body;

    console.log('🧪 Testing agent with:', prompt);

    const startTime = Date.now();
    const response = await withTimeout(
      executeAgentQuery(prompt, { maxIterations: 5 }),
      30_000, // 30 seconds for test
      'Agent test timed out after 30 seconds'
    );
    const responseTime = Date.now() - startTime;

    res.json({
      status: 'success',
      response,
      responseTime,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Agent test failed:', error);
    res.status(500).json({
      status: 'error',
      message: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
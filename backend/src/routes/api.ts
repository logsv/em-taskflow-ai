import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
// import pdfParse from 'pdf-parse'; // Temporarily disabled due to module issues
import axios from 'axios';
import { fileURLToPath } from 'url';
import taskManager from '../services/taskManager.js';
import llmService from '../services/llmService.js';
import agentService from '../services/agentService.js';
import databaseService from '../services/databaseService.js';
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

// PDF Upload Endpoint
router.post('/upload-pdf', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const pdfPath = req.file.path;
    const dataBuffer = fs.readFileSync(pdfPath);
    // const pdfData = await pdfParse(dataBuffer); // Temporarily disabled
    const pdfData = { text: 'PDF parsing temporarily disabled for TypeScript migration testing' };

    // Chunking: split by paragraphs (or implement token-based chunking)
    const paragraphs = pdfData.text.split('\n\n').filter((p: string) => p.trim().length > 0);
    const chunks: string[] = [];
    let chunk = '';
    for (const para of paragraphs) {
      if ((chunk + para).length > 1000) { // adjust chunk size as needed
        chunks.push(chunk);
        chunk = '';
      }
      chunk += para + '\n\n';
    }
    if (chunk) chunks.push(chunk);

    // Embedding and Chroma storage
    const chromaCollection = 'pdf_chunks'; // or use req.file.originalname as collection name
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];

      // 1. Get embedding from Ollama
      const embeddingRes = await axios.post('http://localhost:11434/api/embeddings', {
        model: 'deepseek-embedding-v1',
        prompt: text
      });
      const embedding = embeddingRes.data.embedding;

      // 2. Store in Chroma
      await axios.post('http://localhost:8000/api/v1/collections/' + chromaCollection + '/add', {
        ids: [`${req.file.filename}_${i}`],
        embeddings: [embedding],
        metadatas: [{
          filename: req.file?.originalname || 'unknown',
          chunk_index: i,
          text: text
        }],
        documents: [text]
      });
    }

    res.json({ status: 'success', chunks: chunks.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process PDF' });
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
    
    // Process query with agentService
    const agentResponse = await agentService.processQuery(prompt);
    
    // Save chat interaction to database
    try {
      await databaseService.saveChatHistory(prompt, agentResponse.response, sessionId || null, {
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent']
      });
    } catch (dbError) {
      console.warn('Failed to save chat history:', dbError);
    }
    
    res.json({ response: agentResponse.response, intent: agentResponse.intent, dataUsed: agentResponse.dataUsed });
  } catch (error) {
    console.error('Error in /llm-summary:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/rag-query - Process user queries with RAG (Retrieval-Augmented Generation)
router.post('/rag-query', async (req: RAGQueryRequest, res: Response) => {
  try {
    const { query, top_k = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // 1. Get embedding for the query from Ollama
    const embeddingRes = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'deepseek-embedding-v1',
      prompt: query
    });
    const queryEmbedding = embeddingRes.data.embedding;

    // 2. Search Chroma for similar chunks
    const chromaCollection = 'pdf_chunks';
    const searchRes = await axios.post(`http://localhost:8000/api/v1/collections/${chromaCollection}/query`, {
      query_embeddings: [queryEmbedding],
      n_results: top_k
    });

    const results = searchRes.data;
    const retrievedChunks = results.documents && results.documents[0] ? results.documents[0] : [];
    const metadatas = results.metadatas && results.metadatas[0] ? results.metadatas[0] : [];

    // 3. Assemble context for LLM
    const context = retrievedChunks.map((chunk: string, i: number) => `Source [${i+1}]:\n${chunk}`).join('\n\n');
    const prompt = `You are an assistant. Use the following context to answer the user's question.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;

    // 4. Call Ollama LLM for answer (using a chat or completion model)
    const llmRes = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-v1', // or another chat/completion model you have in Ollama
      prompt: prompt,
      stream: false
    });

    const answer = llmRes.data.response;

    res.json({
      answer,
      sources: metadatas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process RAG query' });
  }
});

// Database routes
router.use('/database', databaseRouter);

export default router;

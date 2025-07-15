const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const taskManager = require('../services/taskManager');
const llmService = require('../services/llmService');
const notion = require('../integrations/notion');
const router = express.Router();
const agentService = require('../services/agentService');
const databaseService = require('../services/databaseService');
const databaseRouter = require('./database');

// Ensure PDF storage directory exists
const pdfDir = path.join(__dirname, '../../data/pdfs/');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
const upload = multer({ dest: pdfDir });

// PDF Upload Endpoint
router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const pdfPath = req.file.path;
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);

    // Chunking: split by paragraphs (or implement token-based chunking)
    const paragraphs = pdfData.text.split('\n\n').filter(p => p.trim().length > 0);
    const chunks = [];
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
          filename: req.file.originalname,
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
router.get('/summary', async (req, res) => {
  try {
    const { jiraTasks, notionPages, calendarEvents, calendarConflicts } = await taskManager.fetchAllStatus();
    // Fetch Notion page updates for each page
    const pageUpdates = {};
    for (const page of notionPages) {
      pageUpdates[page.id] = await notion.summarizePageUpdates(page.id);
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
router.post('/complete', async (req, res) => {
  const { taskType, taskId, note } = req.body;
  if (!taskType || !taskId || !note) {
    return res.status(400).json({ error: 'taskType, taskId, and note are required.' });
  }
  try {
    const result = await taskManager.markTaskComplete(taskType, taskId, note);
    res.json({ success: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark task complete.' });
  }
});

// GET /api/suggestions - LLM-powered smart suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const suggestions = await agentService.generateSmartSuggestions(sessionId);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate suggestions.' });
  }
});

// POST /api/llm-summary - Process user queries with LangGraph Agent
router.post('/llm-summary', async (req, res) => {
  try {
    const { prompt, sessionId } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Pass sessionId to processUserQuery to retrieve chat history
    const response = await agentService.processUserQuery(prompt, sessionId);
    
    // Save chat interaction to database
    try {
      await databaseService.saveChatHistory(prompt, response, sessionId, {
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent']
      });
    } catch (dbError) {
      console.warn('Failed to save chat history:', dbError);
    }
    
    res.json({ response });
  } catch (error) {
    console.error('Error in /llm-summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rag-query - Process user queries with RAG (Retrieval-Augmented Generation)
router.post('/rag-query', async (req, res) => {
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
    const context = retrievedChunks.map((chunk, i) => `Source [${i+1}]:\n${chunk}`).join('\n\n');
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

module.exports = router;

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
// import pdfParse from 'pdf-parse'; // Temporarily disabled due to module issues
import axios from 'axios';
import { fileURLToPath } from 'url';
import taskManager from '../services/taskManager.js';
import llmService from '../services/llmService.js';
import agentService from '../services/agentService.js';
import ragService from '../services/ragService.js';
import databaseService from '../services/databaseService.js';
import databaseRouter from './database.js';
// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
// Ensure PDF storage directory exists
const pdfDir = path.join(__dirname, '../../data/pdfs/');
if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}
const upload = multer({ dest: pdfDir });
// PDF Upload Endpoint - Now uses RAG service
router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
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
        }
        else {
            res.status(500).json({
                error: 'Failed to process PDF',
                details: result.error
            });
        }
    }
    catch (err) {
        console.error('❌ PDF upload error:', err);
        res.status(500).json({ error: 'Failed to process PDF upload' });
    }
});
// GET /api/summary - Unified status summary
router.get('/summary', async (req, res) => {
    try {
        const { jiraTasks, notionPages, calendarEvents, calendarConflicts } = await taskManager.fetchAllStatus();
        // Fetch Notion page updates for each page
        const pageUpdates = {};
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
    }
    catch (err) {
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
        const result = await taskManager.markTaskComplete(taskId);
        res.json({ success: result });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to mark task complete.' });
    }
});
// GET /api/suggestions - LLM-powered smart suggestions
router.get('/suggestions', async (req, res) => {
    try {
        const { sessionId } = req.query;
        // Smart suggestions temporarily disabled - using placeholder
        const suggestions = ['Review pending tasks', 'Check calendar conflicts', 'Update project status'];
        res.json({ suggestions });
    }
    catch (err) {
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
        // Process query with integrated RAG+MCP+Agent service
        const agentResponse = await agentService.processQuery(prompt);
        // agentResponse is now a string (the response itself)
        // Save chat interaction to database (already handled in processQuery)
        res.json({
            response: agentResponse,
            message: 'Response generated using integrated RAG, MCP, and LLM agent',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error in /llm-summary:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/rag-query - Process user queries with integrated RAG+MCP+Agent flow
router.post('/rag-query', async (req, res) => {
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
    }
    catch (err) {
        console.error('❌ RAG query error:', err);
        res.status(500).json({ error: 'Failed to process RAG query' });
    }
});
// Database routes
router.use('/database', databaseRouter);
export default router;
//# sourceMappingURL=api.js.map
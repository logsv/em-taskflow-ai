const express = require('express');
const taskManager = require('../services/taskManager');
const llmService = require('../services/llmService');
const notion = require('../integrations/notion');
const router = express.Router();
const agentService = require('../services/agentService');
const databaseService = require('../services/databaseService');
const databaseRouter = require('./database');

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
    const suggestions = await agentService.generateSmartSuggestions();
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
    
    const response = await agentService.processUserQuery(prompt);
    
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

// Database routes
router.use('/database', databaseRouter);

module.exports = router;

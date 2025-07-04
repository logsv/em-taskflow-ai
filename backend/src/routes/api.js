const express = require('express');
const router = express.Router();
const taskManager = require('../services/taskManager');
const summaryFormatter = require('../services/summaryFormatter');
const notion = require('../integrations/notion');
const llmService = require('../services/llmService');

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
    const { jiraTasks, notionPages, calendarEvents, calendarConflicts } = await taskManager.fetchAllStatus();
    // Build a concise summary for the LLM
    const jiraSummary = jiraTasks.map(t => `[${t.key}] ${t.summary} (${t.status})`).join('\n');
    const notionSummary = notionPages.map(p => `${p.title} (Last edited: ${p.last_edited_time})`).join('\n');
    const calendarSummary = calendarEvents.map(e => `${e.summary} (${e.start} - ${e.end})`).join('\n');
    const conflictSummary = calendarConflicts.length ? calendarConflicts.map(([a, b]) => `"${a.summary}" overlaps with "${b.summary}"`).join('\n') : 'None';

    const prompt = `You are a productivity assistant.\n\nJira Tasks:\n${jiraSummary}\n\nNotion Projects:\n${notionSummary}\n\nToday's Meetings:\n${calendarSummary}\n\nScheduling Conflicts:\n${conflictSummary}\n\nBased on the above, suggest the top 3 things the user should focus on today, and any urgent follow-ups. Be concise, actionable, and professional. Format as a numbered list.`;
    const suggestions = await llmService.complete(prompt, { maxTokens: 256 });
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate suggestions.' });
  }
});

module.exports = router;

require('dotenv').config();
const axios = require('axios');

/**
 * Fetches all relevant data from Jira, Notion, and Calendar.
 */
async function fetchAllStatus() {
  const [jiraTasks, notionPages, calendarEvents] = await Promise.all([
    jira.fetchAssignedTasks(),
    notion.fetchProjectPages(),
    calendar.fetchTodaysEvents()
  ]);
  const calendarConflicts = calendar.detectConflicts(calendarEvents);
  return { jiraTasks, notionPages, calendarEvents, calendarConflicts };
}

/**
 * Mark a task as complete and update all systems with a status note/tag.
 * taskType: 'jira' | 'notion' | 'calendar'
 * taskId: issueId, pageId, or eventId
 * note: status note to add
 */
async function markTaskComplete(taskType, taskId, note) {
  if (taskType === 'jira') {
    return await jira.updateTaskStatus(taskId, note);
  } else if (taskType === 'notion') {
    return await notion.updatePageStatus(taskId, note);
  } else if (taskType === 'calendar') {
    return await calendar.updateEventStatus(taskId, note);
  }
  return false;
}

const mcpServers = {
  Notion: {
    url: 'https://mcp.notion.com/mcp',
  },
};

const fetchProjectPages = async () => {
  try {
    const response = await axios.post(mcpServers.Notion.url, {
      tool: 'fetchProjectPages',
      args: {},
    });
    return response.data.result || [];
  } catch (error) {
    console.error('MCP Notion fetchProjectPages error:', error.message);
    return [];
  }
};

const updatePageStatus = async (pageId, note) => {
  try {
    const response = await axios.post(mcpServers.Notion.url, {
      tool: 'updatePageStatus',
      args: { pageId, note },
    });
    return response.data.result === true;
  } catch (error) {
    console.error('MCP Notion updatePageStatus error:', error.message);
    return false;
  }
};

const summarizePageUpdates = async (pageId) => {
  try {
    const response = await axios.post(mcpServers.Notion.url, {
      tool: 'summarizePageUpdates',
      args: { pageId },
    });
    return response.data.result || [];
  } catch (error) {
    console.error('MCP Notion summarizePageUpdates error:', error.message);
    return ['Unable to fetch comments.'];
  }
};

module.exports = {
  fetchProjectPages,
  updatePageStatus,
  summarizePageUpdates,
  // ...other taskManager exports as needed
};

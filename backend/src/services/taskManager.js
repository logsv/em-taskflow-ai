const jira = require('../integrations/jira');
const notion = require('../integrations/notion');
const calendar = require('../integrations/calendar');

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

module.exports = { fetchAllStatus, markTaskComplete };

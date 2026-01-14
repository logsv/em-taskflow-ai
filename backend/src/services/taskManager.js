import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function fetchProjectPages() {
  try {
    console.log('Fetching project pages from Notion...');
    return [];
  } catch (error) {
    console.error('Notion fetchProjectPages error:', error.message);
    return [];
  }
}

async function updatePageStatus(pageId, note) {
  try {
    console.log(`Updating page ${pageId} with note: ${note}`);
    return true;
  } catch (error) {
    console.error('Notion updatePageStatus error:', error.message);
    return false;
  }
}

async function summarizePageUpdates(pageId) {
  try {
    console.log(`Summarizing updates for page ${pageId}`);
    return [`Page ${pageId} has been updated`];
  } catch (error) {
    console.error('Notion summarizePageUpdates error:', error.message);
    return [];
  }
}

async function fetchAssignedTasks() {
  try {
    console.log('Fetching assigned tasks from Jira...');
    return [];
  } catch (error) {
    console.error('Jira fetchAssignedTasks error:', error.message);
    return [];
  }
}

async function fetchTodaysEvents() {
  try {
    console.log("Fetching today's events from Google Calendar...");
    return [];
  } catch (error) {
    console.error('Google Calendar fetchTodaysEvents error:', error.message);
    return [];
  }
}

async function fetchAllStatus() {
  try {
    const [notionPages, jiraTasks, calendarEvents] = await Promise.all([
      fetchProjectPages(),
      fetchAssignedTasks(),
      fetchTodaysEvents(),
    ]);

    const calendarConflicts = detectConflicts(calendarEvents);

    return {
      notionPages,
      jiraTasks,
      calendarEvents,
      calendarConflicts,
    };
  } catch (error) {
    console.error('Error fetching all status:', error);
    return {};
  }
}

async function updateTaskStatus(taskId, status) {
  try {
    console.log(`Updating task ${taskId} to status: ${status}`);
    return true;
  } catch (error) {
    console.error('Jira updateTaskStatus error:', error.message);
    return false;
  }
}

async function markTaskComplete(taskId) {
  return updateTaskStatus(taskId, 'Done');
}

const detectConflicts = (events) => {
  const conflicts = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const event1 = events[i];
      const event2 = events[j];

      if (!event1 || !event2) continue;

      const start1 = new Date(event1.start);
      const end1 = new Date(event1.end);
      const start2 = new Date(event2.start);
      const end2 = new Date(event2.end);

      if (start1 < end2 && start2 < end1) {
        conflicts.push([event1, event2]);
      }
    }
  }

  return conflicts;
};

const taskManager = {
  fetchAllStatus,
  fetchAssignedTasks,
  fetchProjectPages,
  fetchTodaysEvents,
  updateTaskStatus,
  updatePageStatus,
  markTaskComplete,
  detectConflicts,
  summarizePageUpdates,
};

export default taskManager;
export {
  fetchAllStatus,
  fetchAssignedTasks,
  fetchProjectPages,
  fetchTodaysEvents,
  updateTaskStatus,
  updatePageStatus,
  markTaskComplete,
  detectConflicts,
  summarizePageUpdates,
};


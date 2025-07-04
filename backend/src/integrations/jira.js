const JiraClient = require('jira-client');
require('dotenv').config();

const jira = new JiraClient({
  protocol: 'https',
  host: process.env.JIRA_HOST,
  username: process.env.JIRA_EMAIL,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '2',
  strictSSL: true
});

/**
 * Fetch all Jira tasks assigned to the user.
 * Returns array of { key, summary, status, url }
 */
async function fetchAssignedTasks() {
  try {
    const jql = 'assignee = currentUser() ORDER BY updated DESC';
    const result = await jira.searchJira(jql, {
      fields: ['summary', 'status'],
      maxResults: 50
    });
    return result.issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      url: `https://${process.env.JIRA_HOST}/browse/${issue.key}`
    }));
  } catch (error) {
    console.error('Error fetching Jira tasks:', error.message);
    return [];
  }
}

/**
 * Update a Jira task with a status note/tag (adds a comment).
 */
async function updateTaskStatus(issueId, note) {
  try {
    await jira.addComment(issueId, note);
    return true;
  } catch (error) {
    console.error(`Error updating Jira issue ${issueId}:`, error.message);
    return false;
  }
}

module.exports = { fetchAssignedTasks, updateTaskStatus };

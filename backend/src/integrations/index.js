/**
 * Unified Integrations Client Layer (GoF Adapter / Facade Pattern)
 * Central export of all normalized third-party integration clients.
 */

export { BaseIntegrationClient } from './clients/BaseIntegrationClient.js';
export { GitHubClient, githubClient } from './clients/GitHubClient.js';
export { JiraClient, jiraClient } from './clients/JiraClient.js';
export { NotionClient, notionClient } from './clients/NotionClient.js';
export { GoogleCalendarClient, googleCalendarClient } from './clients/GoogleCalendarClient.js';
export { SlackClient, slackClient } from './clients/SlackClient.js';

import githubClient from './clients/GitHubClient.js';
import jiraClient from './clients/JiraClient.js';
import notionClient from './clients/NotionClient.js';
import googleCalendarClient from './clients/GoogleCalendarClient.js';
import slackClient from './clients/SlackClient.js';

export const clients = {
  github: githubClient,
  jira: jiraClient,
  notion: notionClient,
  googleCalendar: googleCalendarClient,
  slack: slackClient,
};

export default clients;

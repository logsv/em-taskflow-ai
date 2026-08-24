/**
 * Node.js Temporal Workflows for EM TaskFlow AI
 * Durable execution with parallel tool activities and fault tolerance.
 */

import { proxyActivities } from '@temporalio/workflow';

const activities = proxyActivities({
  startToCloseTimeout: '45 seconds',
  retry: {
    initialInterval: '2s',
    maximumInterval: '15s',
    maximumAttempts: 2,
  },
});

/**
 * Durable Team Auto-Discovery & Cross-Source Identity Reconciliation Workflow.
 * Executes all 4 tool activities concurrently in parallel!
 */
export async function teamAutoDiscoveryWorkflow(params = {}) {
  // 1. Run GitHub, Jira, Notion, and Google Calendar harvests concurrently in parallel
  const [githubHarvest, jiraHarvest, notionHarvest, gcalHarvest] = await Promise.all([
    activities.fetchGitHubTeamActivity(params),
    activities.fetchJiraTeamActivity(params),
    activities.fetchNotionTeamActivity(params),
    activities.fetchGCalTeamActivity(params),
  ]);

  // 2. Reconcile findings across all tools and persist to taskflow_backend PostgreSQL
  const reconcileResult = await activities.reconcileAndPersistTeamActivity({
    harvestResults: [githubHarvest, jiraHarvest, notionHarvest, gcalHarvest],
  });

  return {
    status: 'COMPLETED',
    syncedCount: reconcileResult.persistedCount,
    toolBreakdown: {
      github: githubHarvest.count,
      jira: jiraHarvest.count,
      notion: notionHarvest.count,
      gcal: gcalHarvest.count,
    },
    members: reconcileResult.members,
  };
}

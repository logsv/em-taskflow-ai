/**
 * Node.js Temporal Workflows for EM TaskFlow AI
 * Durable execution with parallel tool activities and fault tolerance.
 */

import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow';

const activities = proxyActivities({
  startToCloseTimeout: '45 seconds',
  retry: {
    initialInterval: '2s',
    maximumInterval: '15s',
    maximumAttempts: 2,
  },
});

/**
 * Signals for Human-in-the-Loop (HITL) Slack Post Approval
 */
export const approveSlackPostSignal = defineSignal('approveSlackPost');
export const rejectSlackPostSignal = defineSignal('rejectSlackPost');

/**
 * Durable Human-in-the-Loop (HITL) Slack Post Workflow.
 * Holds the draft Slack message until a human confirms or rejects the post.
 * If approved, dispatches the message to the specified Slack channel via activity.
 */
export async function slackPostHITLWorkflow(params = {}) {
  const {
    channel = '#engineering-retro',
    message = '',
    sprintName = 'Current Sprint',
    requestedBy = 'EM TaskFlow Agent',
    timeoutMinutes = 60,
  } = params;

  let isApproved = false;
  let isRejected = false;
  let approvalPayload = null;
  let rejectionPayload = null;

  // 1. Register signal handlers for human interaction
  setHandler(approveSlackPostSignal, (payload) => {
    isApproved = true;
    approvalPayload = payload || {};
  });

  setHandler(rejectSlackPostSignal, (payload) => {
    isRejected = true;
    rejectionPayload = payload || {};
  });

  // 2. Wait for human approval signal or timeout window
  const receivedSignal = await condition(
    () => isApproved || isRejected,
    `${timeoutMinutes} minutes`
  );

  // 3. Handle timeout (no human action taken)
  if (!receivedSignal) {
    return {
      status: 'TIMED_OUT',
      channel,
      draftMessage: message,
      sprintName,
      requestedBy,
      reason: `Human approval window expired after ${timeoutMinutes} minutes`,
      posted: false,
    };
  }

  // 4. Handle rejection by human
  if (isRejected) {
    return {
      status: 'REJECTED',
      channel,
      draftMessage: message,
      sprintName,
      requestedBy,
      rejectedBy: rejectionPayload?.rejectedBy || 'Engineering Manager',
      reason: rejectionPayload?.reason || 'Draft post rejected by reviewer',
      posted: false,
    };
  }

  // 5. Handle approval: Resolve target channel & message (allowing overrides) and post
  const finalChannel = approvalPayload?.targetChannel || channel;
  const finalMessage = approvalPayload?.modifiedMessage || message;
  const approver = approvalPayload?.approver || 'Engineering Manager';

  const postResult = await activities.postSlackMessageActivity({
    channel: finalChannel,
    message: finalMessage,
    approver,
    sprintName,
  });

  return {
    status: 'POSTED',
    channel: finalChannel,
    message: finalMessage,
    sprintName,
    approver,
    requestedBy,
    posted: true,
    postResult,
  };
}

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

/**
 * Durable Autonomous EM Task & Health Audit Workflow.
 * Executes parallel domain harvests, calculates health score, persists action items, and dispatches Slack notifications.
 */
export async function emAutonomousAuditWorkflow(params = {}) {
  // 1. Parallel harvests across 4 domains
  const [deliveryHarvest, peopleHarvest, sprintOkrHarvest, sopHarvest] = await Promise.all([
    activities.harvestDoraAndDeliveryActivity(params),
    activities.harvestPeopleAndCadenceActivity(params),
    activities.harvestSprintAndOkrActivity(params),
    activities.harvestSopAndGovernanceActivity(params),
  ]);

  // 2. Synthesize health score, deduplicate & persist action items and audit run
  const synthesisResult = await activities.synthesizeAuditAndActionItemsActivity({
    triggeredBy: params.triggeredBy || 'CRON_4H',
    harvestResults: {
      delivery: deliveryHarvest,
      people: peopleHarvest,
      sprintOkr: sprintOkrHarvest,
      sop: sopHarvest,
    },
  });

  // 3. Dispatch multi-channel Slack notification
  const slackResult = await activities.dispatchSlackAuditNotificationActivity({
    auditRun: synthesisResult.auditRun,
    topActions: synthesisResult.topActions,
    mode: params.slackMode || 'consolidated',
    channel: params.slackChannel,
  });

  return {
    status: 'COMPLETED',
    auditRunId: synthesisResult.auditRun.id,
    healthScore: synthesisResult.auditRun.healthScore,
    actionItemsCount: synthesisResult.actionItems?.length || 0,
    slackResult,
    summary: synthesisResult.auditRun.summaryMarkdown,
  };
}


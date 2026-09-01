/**
 * Temporal Client Module for Node.js Express Gateway
 * Triggers and monitors RAG Ingestion Workflows on Temporal Server.
 */

import { Connection, Client } from '@temporalio/client';
import { info, warn, debug } from '../utils/logger.js';

let temporalClient = null;
let hasLoggedTestWarning = false;

export async function getTemporalClient() {
  if (temporalClient) return temporalClient;

  const isTest = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('jasmine'));
  if (isTest && process.env.TEMPORAL_TEST_ENABLED !== 'true') {
    return null;
  }

  const hostsToTry = process.env.TEMPORAL_HOST ? [process.env.TEMPORAL_HOST] : ['temporal:7233', '127.0.0.1:7233'];
  const timeoutMs = isTest ? 150 : 3000;

  for (const host of hostsToTry) {
    try {
      const connectPromise = Connection.connect({ address: host });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Connection timeout (${timeoutMs}ms)`)), timeoutMs)
      );
      const connection = await Promise.race([connectPromise, timeoutPromise]);
      temporalClient = new Client({ connection });
      info({ module: 'temporalClient', action: 'connect', host }, `Node.js connected to Temporal Server at ${host}`);
      return temporalClient;
    } catch {
      // Continue to next host candidate
    }
  }

  if (!isTest || !hasLoggedTestWarning) {
    if (!isTest) {
      warn({ module: 'temporalClient', action: 'connectWarning', hosts: hostsToTry }, 'Node.js failed to connect to Temporal Server');
    }
    hasLoggedTestWarning = true;
  }
  return null;
}

export async function startRAGIngestWorkflow(filePath, filename) {
  const client = await getTemporalClient();
  if (!client) {
    return null;
  }

  const workflowId = `rag-ingest-${filename.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}`;
  try {
    const handle = await client.workflow.start('RAGIngestWorkflow', {
      taskQueue: 'rag-ingest-queue',
      args: [{ file_path: filePath, filename }],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startRAGIngestWorkflow', workflowId: handle.workflowId }, 'Started Temporal RAG Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startRAGIngestWorkflowFallback', err }, 'Failed to start Temporal RAG Workflow');
    return null;
  }
}

export async function startChatFileExtractWorkflow(filePath, filename, mimeType = '') {
  const client = await getTemporalClient();
  if (!client) {
    return null;
  }

  const workflowId = `chat-extract-${filename.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}`;
  try {
    const handle = await client.workflow.start('ChatFileExtractWorkflow', {
      taskQueue: 'rag-ingest-queue',
      args: [{ file_path: filePath, filename, mime_type: mimeType }],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startChatFileExtractWorkflow', workflowId: handle.workflowId }, 'Started Temporal Chat File Extraction Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startChatFileExtractWorkflowFallback', err }, 'Failed to start Temporal Chat File Extraction Workflow');
    return null;
  }
}

export async function getWorkflowStatus(workflowId) {
  const client = await getTemporalClient();
  if (!client) return null;

  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();
    const statusName = description.status.name;
    
    let resultPayload = null;
    let failureError = null;
    if (statusName === 'COMPLETED') {
      try {
        resultPayload = await handle.result();
      } catch (e) {
        warn({ module: 'temporalClient', action: 'getWorkflowStatusResultFallback', workflowId, err: e }, 'Could not retrieve result for completed workflow');
      }
    } else if (statusName === 'FAILED') {
      try {
        await handle.result();
      } catch (e) {
        failureError = e.message || 'Workflow execution failed';
      }
    }

    return {
      workflowId,
      status: statusName,
      startTime: description.startTime,
      closeTime: description.closeTime || null,
      result: resultPayload,
      error: failureError,
    };
  } catch (err) {
    return { workflowId, status: 'UNKNOWN', error: err.message };
  }
}

export async function startDeepBenchmarkWorkflow(options = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const { modelTarget = 'hermes3:8b', trulensLimit = 5 } = options;
  const workflowId = `deep-benchmark-${Date.now()}`;
  try {
    const handle = await client.workflow.start('DeepEvaluationBenchmarkWorkflow', {
      taskQueue: 'rag-ingest-queue',
      args: [{ model_name: modelTarget, trulens_limit: trulensLimit }],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startDeepBenchmarkWorkflow', workflowId: handle.workflowId }, 'Started Temporal Deep Benchmark Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startDeepBenchmarkWorkflowFallback', err }, 'Failed to start Temporal Deep Benchmark Workflow');
    return null;
  }
}

export async function startTraceReplayWorkflow(options = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const { baselineModel = 'hermes3:8b', candidateModel = 'hermes3:8b' } = options;
  const workflowId = `trace-replay-${Date.now()}`;
  try {
    const handle = await client.workflow.start('TraceReplayWorkflow', {
      taskQueue: 'rag-ingest-queue',
      args: [{ baseline_model: baselineModel, candidate_model: candidateModel }],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startTraceReplayWorkflow', workflowId: handle.workflowId }, 'Started Temporal Trace Replay Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startTraceReplayWorkflowFallback', err }, 'Failed to start Temporal Trace Replay Workflow');
    return null;
  }
}

export async function startTeamDiscoveryWorkflow(params = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const workflowId = `team-discovery-sync-${Date.now()}`;
  try {
    const handle = await client.workflow.start('teamAutoDiscoveryWorkflow', {
      taskQueue: 'team-sync-queue',
      args: [params],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startTeamDiscoveryWorkflow', workflowId: handle.workflowId }, 'Started Node.js Temporal Team Discovery Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startTeamDiscoveryWorkflowFallback', err }, 'Failed to start Node.js Temporal Team Discovery Workflow');
    return null;
  }
}

export async function executeTeamDiscoveryWorkflow(params = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const workflowId = `team-discovery-sync-${Date.now()}`;
  try {
    const handle = await client.workflow.start('teamAutoDiscoveryWorkflow', {
      taskQueue: 'team-sync-queue',
      args: [params],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'executeTeamDiscoveryWorkflow', workflowId: handle.workflowId }, 'Executing Node.js Temporal Team Discovery Workflow');
    const result = await handle.result();
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'COMPLETED',
      result,
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'executeTeamDiscoveryWorkflowFallback', err }, 'Failed executing Node.js Temporal Team Discovery Workflow');
    return null;
  }
}

export async function startPromptEvaluationWorkflow(options = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const evalTaskQueue = process.env.TEMPORAL_EVAL_TASK_QUEUE || 'eval-task-queue';
  const workflowId = `prompt-eval-${Date.now()}`;
  const modelTarget = options.modelTarget || 'hermes3:8b';
  const limit = options.limit || 10;
  const batchSize = options.batchSize || 2;

  try {
    const handle = await client.workflow.start('PromptEvaluationWorkflow', {
      taskQueue: evalTaskQueue,
      args: [{ model_name: modelTarget, limit, batch_size: batchSize }],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startPromptEvaluationWorkflow', workflowId: handle.workflowId }, 'Started Temporal Prompt Evaluation Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startPromptEvaluationWorkflowFallback', err }, 'Failed to start Temporal Prompt Evaluation Workflow');
    return null;
  }
}

/**
 * Start a Human-in-the-Loop (HITL) Slack Post Workflow on Temporal.
 * Holds message draft until approved or rejected via signal.
 */
export async function startSlackPostHITLWorkflow(params = {}) {
  const client = await getTemporalClient();
  const workflowId = `slack-post-hitl-${Date.now()}`;

  if (!client) {
    info({ module: 'temporalClient', action: 'startSlackPostHITLWorkflowSimulated', workflowId }, 'Temporal client unavailable; returning simulated HITL handle');
    return {
      workflowId,
      runId: `run-${Date.now()}`,
      status: 'PENDING_HUMAN_APPROVAL',
      orchestrator: 'in_memory_hitl',
      channel: params.channel || '#engineering-retro',
      message: params.message || '',
    };
  }

  try {
    const handle = await client.workflow.start('slackPostHITLWorkflow', {
      taskQueue: 'team-sync-queue',
      args: [params],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startSlackPostHITLWorkflow', workflowId: handle.workflowId }, 'Started Temporal Slack Post HITL Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'PENDING_HUMAN_APPROVAL',
      orchestrator: 'temporal',
      channel: params.channel || '#engineering-retro',
      message: params.message || '',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startSlackPostHITLWorkflowFallback', err }, 'Failed to start Temporal Slack Post HITL Workflow');
    return {
      workflowId,
      runId: `run-${Date.now()}`,
      status: 'PENDING_HUMAN_APPROVAL',
      orchestrator: 'in_memory_hitl',
      channel: params.channel || '#engineering-retro',
      message: params.message || '',
    };
  }
}

/**
 * Signal a running Slack Post HITL Workflow with approval or rejection.
 */
export async function signalSlackPostApproval(workflowId, options = {}) {
  const {
    approved = true,
    approver = 'Engineering Manager',
    modifiedMessage = null,
    targetChannel = null,
    reason = '',
  } = options;

  const client = await getTemporalClient();
  if (!client) {
    info({ module: 'temporalClient', action: 'signalSlackPostApprovalSimulated', workflowId, approved }, 'Simulated signal dispatch (Temporal offline)');
    return {
      workflowId,
      signalSent: true,
      approved,
      status: approved ? 'APPROVED_SIMULATED' : 'REJECTED_SIMULATED',
    };
  }

  try {
    const handle = client.workflow.getHandle(workflowId);
    if (approved) {
      await handle.signal('approveSlackPost', {
        approver,
        modifiedMessage,
        targetChannel,
      });
      info({ module: 'temporalClient', action: 'signalApproveSlackPost', workflowId, approver }, 'Dispatched approveSlackPost signal');
    } else {
      await handle.signal('rejectSlackPost', {
        rejectedBy: approver,
        reason: reason || 'Post rejected by reviewer',
      });
      info({ module: 'temporalClient', action: 'signalRejectSlackPost', workflowId, approver }, 'Dispatched rejectSlackPost signal');
    }

    return {
      workflowId,
      signalSent: true,
      approved,
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'signalSlackPostApprovalError', workflowId, err }, 'Failed to signal Temporal Slack Post Workflow');
    return {
      workflowId,
      signalSent: false,
      error: err.message,
    };
  }
}

export async function startEmAutonomousAuditWorkflow(params = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const workflowId = `em-audit-${Date.now()}`;
  try {
    const handle = await client.workflow.start('emAutonomousAuditWorkflow', {
      taskQueue: 'team-sync-queue',
      args: [params],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startEmAutonomousAuditWorkflow', workflowId: handle.workflowId }, 'Started Temporal Autonomous Audit Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startEmAutonomousAuditWorkflowFallback', err }, 'Failed to start Temporal Autonomous Audit Workflow');
    return null;
  }
}

export async function executeEmAutonomousAuditWorkflow(params = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const workflowId = `em-audit-${Date.now()}`;
  try {
    const handle = await client.workflow.start('emAutonomousAuditWorkflow', {
      taskQueue: 'team-sync-queue',
      args: [params],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'executeEmAutonomousAuditWorkflow', workflowId: handle.workflowId }, 'Executing Temporal Autonomous Audit Workflow');
    const result = await handle.result();
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'COMPLETED',
      result,
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'executeEmAutonomousAuditWorkflowFallback', err }, 'Failed executing Temporal Autonomous Audit Workflow');
    return null;
  }
}

export async function ensureAuditCronSchedule(cronExpression = '0 */4 * * *') {
  const client = await getTemporalClient();
  if (!client || !client.schedule) return null;

  const scheduleId = 'em-autonomous-audit-schedule';
  try {
    await client.schedule.create({
      scheduleId,
      spec: {
        cronExpressions: [cronExpression],
      },
      action: {
        type: 'startWorkflow',
        workflowType: 'emAutonomousAuditWorkflow',
        taskQueue: 'team-sync-queue',
        args: [{ triggeredBy: 'CRON_4H' }],
      },
      policies: {
        overlap: 'SKIP',
      },
    });
    info({ module: 'temporalClient', action: 'ensureAuditCronScheduleCreated', scheduleId, cronExpression }, 'Registered Temporal Autonomous Audit Cron Schedule');
    return { status: 'CREATED', scheduleId, cron: cronExpression };
  } catch (err) {
    if (String(err.message || '').includes('already exists') || String(err.message || '').includes('ScheduleAlreadyRunning')) {
      return { status: 'ALREADY_EXISTS', scheduleId, cron: cronExpression };
    }
    warn({ module: 'temporalClient', action: 'ensureAuditCronScheduleWarn', err }, 'Could not register Temporal Audit Cron schedule');
    return { status: 'ERROR', scheduleId, error: err.message };
  }
}

/**
 * Trigger durable Cache Invalidation Workflow via Temporal
 */
export async function startCacheInvalidationWorkflow(params = {}) {
  const client = await getTemporalClient();
  if (!client) {
    // Direct in-process fallback when Temporal is offline
    try {
      const { invalidateCacheActivity } = await import('./activities.js');
      const directResult = await invalidateCacheActivity(params);
      return {
        workflowId: `simulated-cache-invalidation-${Date.now()}`,
        status: 'COMPLETED_DIRECT',
        result: directResult,
      };
    } catch (err) {
      warn({ module: 'temporalClient', action: 'directCacheInvalidationFallbackError', err }, 'Direct cache invalidation error');
      return null;
    }
  }

  const workflowId = `cache-invalidation-${params.type || 'all'}-${Date.now()}`;
  try {
    const handle = await client.workflow.start('cacheInvalidationWorkflow', {
      taskQueue: 'team-sync-queue',
      args: [params],
      workflowId,
    });
    info({ module: 'temporalClient', action: 'startCacheInvalidationWorkflow', workflowId: handle.workflowId }, 'Started Temporal Cache Invalidation Workflow');
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    warn({ module: 'temporalClient', action: 'startCacheInvalidationWorkflowFallback', err }, 'Failed to start Temporal Cache Invalidation Workflow');
    return null;
  }
}





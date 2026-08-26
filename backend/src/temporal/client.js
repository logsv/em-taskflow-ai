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




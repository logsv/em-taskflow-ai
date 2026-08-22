/**
 * Temporal Client Module for Node.js Express Gateway
 * Triggers and monitors RAG Ingestion Workflows on Temporal Server.
 */

import { Connection, Client } from '@temporalio/client';

let temporalClient = null;

export async function getTemporalClient() {
  if (temporalClient) return temporalClient;

  const temporalHost = process.env.TEMPORAL_HOST || 'temporal:7233';
  const timeoutMs = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('jasmine')) ? 300 : 5000;
  try {
    const connectPromise = Connection.connect({ address: temporalHost });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timeout (${timeoutMs}ms)`)), timeoutMs)
    );
    const connection = await Promise.race([connectPromise, timeoutPromise]);
    temporalClient = new Client({ connection });
    console.log(`✅ Node.js connected to Temporal Server at ${temporalHost}`);
    return temporalClient;
  } catch (err) {
    console.warn(`⚠️ Node.js failed to connect to Temporal Server at ${temporalHost}: ${err.message}`);
    return null;
  }
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
    console.log(`🚀 Started Temporal RAG Workflow: ${handle.workflowId}`);
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    console.warn(`⚠️ Failed to start Temporal RAG Workflow (${err.message})`);
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
    console.log(`🚀 Started Temporal Chat File Extraction Workflow: ${handle.workflowId}`);
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    console.warn(`⚠️ Failed to start Temporal Chat File Extraction Workflow (${err.message})`);
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
        console.warn(`⚠️ Could not retrieve result for completed workflow ${workflowId}: ${e.message}`);
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
    console.log(`🚀 Started Temporal Deep Benchmark Workflow: ${handle.workflowId}`);
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    console.warn(`⚠️ Failed to start Temporal Deep Benchmark Workflow (${err.message})`);
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
    console.log(`🚀 Started Temporal Trace Replay Workflow: ${handle.workflowId}`);
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    console.warn(`⚠️ Failed to start Temporal Trace Replay Workflow (${err.message})`);
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
    console.log(`🚀 Started Node.js Temporal Team Discovery Workflow: ${handle.workflowId}`);
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    console.warn(`⚠️ Failed to start Node.js Temporal Team Discovery Workflow (${err.message})`);
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
    console.log(`🚀 Executing Node.js Temporal Team Discovery Workflow: ${handle.workflowId}`);
    const result = await handle.result();
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'COMPLETED',
      result,
    };
  } catch (err) {
    console.warn(`⚠️ Failed executing Node.js Temporal Team Discovery Workflow (${err.message})`);
    return null;
  }
}

export async function startPromptEvaluationWorkflow(options = {}) {
  const client = await getTemporalClient();
  if (!client) return null;

  const evalTaskQueue = process.env.TEMPORAL_EVAL_TASK_QUEUE || 'eval-task-queue';
  try {
    const handle = await client.workflow.start('PromptEvaluationWorkflow', {
      taskQueue: evalTaskQueue,
      args: [{ model_name: modelTarget, limit, batch_size: batchSize }],
      workflowId,
    });
    console.log(`🚀 Started Temporal Prompt Evaluation Workflow: ${handle.workflowId}`);
    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      status: 'RUNNING',
    };
  } catch (err) {
    console.warn(`⚠️ Failed to start Temporal Prompt Evaluation Workflow (${err.message})`);
    return null;
  }
}




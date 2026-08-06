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

export async function getWorkflowStatus(workflowId) {
  const client = await getTemporalClient();
  if (!client) return null;

  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return {
      workflowId,
      status: description.status.name,
      startTime: description.startTime,
      closeTime: description.closeTime || null,
    };
  } catch (err) {
    return { workflowId, status: 'UNKNOWN', error: err.message };
  }
}

/**
 * Node.js Temporal Worker
 * Listens on task queue 'team-sync-queue' and executes parallel tool activities.
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { info, warn } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startTemporalNodeWorker() {
  if (process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('jasmine'))) {
    return null; // Skip in unit test runner
  }

  const temporalHost = process.env.TEMPORAL_HOST || 'temporal:7233';
  info({ module: 'temporalWorker', action: 'connecting', temporalHost }, `Connecting Node.js Temporal Worker to host: ${temporalHost}`);

  try {
    const connection = await NativeConnection.connect({
      address: temporalHost,
    });

    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'team-sync-queue',
      identity: 'em-taskflow-nodejs-team-worker',
      workflowsPath: path.join(__dirname, 'workflows.js'),
      activities,
    });

    info({ module: 'temporalWorker', action: 'listening', taskQueue: 'team-sync-queue' }, "Node.js Temporal Worker listening on task queue: 'team-sync-queue'");
    // Register audit schedule
    import('./client.js').then((m) => m.ensureAuditCronSchedule()).catch(() => {});

    // Run worker in background
    worker.run().catch(err => {
      warn({ module: 'temporalWorker', action: 'runtimeWarning', err }, 'Node.js Temporal Worker runtime warning');
    });

    return worker;
  } catch (err) {
    warn({ module: 'temporalWorker', action: 'connectionWarning', err }, 'Node.js Temporal Worker connection warning');
    return null;
  }
}

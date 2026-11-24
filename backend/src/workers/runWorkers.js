/**
 * Background workers: team sync, session cleanup and the Temporal worker (team-sync-queue).
 * Started either inside the API process (WORKERS_IN_PROCESS=true, the local default) or in a
 * separate process via src/worker.js, so a crashing or busy worker cannot take the API down.
 */
import teamSyncWorker from './teamSyncWorker.js';
import sessionCleanupWorker from '../services/SessionCleanupWorker.js';
import { incCounter } from '../core/metrics.js';
import { info, warn } from '../utils/logger.js';
import { swallow } from '../core/safe.js';

let temporalWorker = null;

/** Start every worker. Each one fails on its own: one failing never stops the others. */
export async function startWorkers({ temporal = true } = {}) {
  const started = [];
  for (const [name, start] of [
    ['teamSync', () => teamSyncWorker.start()],
    ['sessionCleanup', () => sessionCleanupWorker.start()],
  ]) {
    try {
      start();
      started.push(name);
    } catch (err) {
      incCounter('worker_start_failed_total', { worker: name }, 1, 'Background workers that failed to start');
      warn({ module: 'workers', worker: name, err: err.message }, `Worker ${name} failed to start`);
    }
  }
  if (temporal) {
    try {
      const { startTemporalNodeWorker } = await import('../temporal/worker.js');
      temporalWorker = await startTemporalNodeWorker();
      if (temporalWorker) started.push('temporal');
      else incCounter('worker_start_failed_total', { worker: 'temporal' }, 1, 'Background workers that failed to start');
    } catch (err) {
      incCounter('worker_start_failed_total', { worker: 'temporal' }, 1, 'Background workers that failed to start');
      warn({ module: 'workers', worker: 'temporal', err: err.message }, 'Temporal worker failed to start');
    }
  }
  info({ module: 'workers', started }, `Background workers started: ${started.join(', ') || 'none'}`);
  return started;
}

export async function stopWorkers() {
  teamSyncWorker.stop?.();
  sessionCleanupWorker.stop?.();
  if (temporalWorker && typeof temporalWorker.shutdown === 'function') {
    await Promise.resolve(temporalWorker.shutdown()).catch(swallow('workers.temporalShutdown'));
  }
  temporalWorker = null;
}

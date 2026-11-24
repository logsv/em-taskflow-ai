import teamSyncWorker from '../../src/workers/teamSyncWorker.js';
import sessionCleanupWorker from '../../src/services/SessionCleanupWorker.js';
import { startWorkers, stopWorkers } from '../../src/workers/runWorkers.js';
import { getCounter, resetMetrics } from '../../src/core/metrics.js';
import { config } from '../../src/config.js';

describe('Background worker runner', () => {
  beforeEach(() => resetMetrics());
  afterEach(async () => stopWorkers());

  it('starts the remaining workers when one fails, and counts the failure', async () => {
    spyOn(teamSyncWorker, 'start').and.throwError('boom');
    spyOn(sessionCleanupWorker, 'start');
    const started = await startWorkers({ temporal: false });
    expect(started).toEqual(['sessionCleanup']);
    expect(getCounter('worker_start_failed_total', { worker: 'teamSync' })).toBe(1);
  });

  it('stops every worker', async () => {
    spyOn(teamSyncWorker, 'stop');
    spyOn(sessionCleanupWorker, 'stop');
    await stopWorkers();
    expect(teamSyncWorker.stop).toHaveBeenCalled();
    expect(sessionCleanupWorker.stop).toHaveBeenCalled();
  });

  it('defaults to running workers in the API process (WORKERS_IN_PROCESS)', () => {
    expect(config.workers.inProcess).toBeTrue();
  });
});

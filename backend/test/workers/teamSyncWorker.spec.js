import teamSyncWorker from '../../src/workers/teamSyncWorker.js';

describe('TeamSyncWorker (Node.js Background Parallel Worker)', () => {
  beforeEach(() => {
    teamSyncWorker.syncIntervalMs = 6 * 60 * 60 * 1000;
  });

  afterEach(() => {
    teamSyncWorker.stop();
    teamSyncWorker.syncIntervalMs = 6 * 60 * 60 * 1000;
  });

  it('should initialize with correct default status and interval', () => {
    const status = teamSyncWorker.getStatus();
    expect(status.worker).toContain('TeamSyncWorker');
    expect(status.isRunning).toBe(false);
    expect(status.intervalMinutes).toBe(360); // 6 hours
  });

  it('should start and stop timer handle cleanly', () => {
    teamSyncWorker.start(60000);
    expect(teamSyncWorker.intervalHandle).not.toBeNull();

    teamSyncWorker.stop();
    expect(teamSyncWorker.intervalHandle).toBeNull();
  });

  it('should execute parallel sync and update lastRunStatus', async () => {
    const res = await teamSyncWorker.executeParallelSync();
    expect(res.status).toBe('SUCCESS');
    expect(res.syncedCount).toBeGreaterThanOrEqual(1);

    const status = teamSyncWorker.getStatus();
    expect(status.lastRunStatus).toBe('SUCCESS');
    expect(status.lastRunAt).not.toBeNull();
  });
});

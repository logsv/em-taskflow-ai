import teamSyncWorker from '../../src/workers/teamSyncWorker.js';
import databaseService from '../../src/db/postgres.js';
import identityService from '../../src/services/identityService.js';

describe('TeamSyncWorker (Node.js Background Parallel Worker)', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    teamSyncWorker.stop();
    teamSyncWorker.syncIntervalMs = 6 * 60 * 60 * 1000;
    teamSyncWorker.lastRunStatus = 'IDLE';
    teamSyncWorker.lastRunAt = null;
    databaseService.inMemoryTeamMembers = [];
    identityService.cachedMembers = [];
  });

  afterEach(() => {
    teamSyncWorker.stop();
    teamSyncWorker.syncIntervalMs = 6 * 60 * 60 * 1000;
    databaseService.inMemoryTeamMembers = [];
    identityService.cachedMembers = [];
    process.env = savedEnv;
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

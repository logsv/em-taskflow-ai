import { SessionCleanupWorker } from '../../src/services/SessionCleanupWorker.js';

describe('SessionCleanupWorker', () => {
  it('executes purgeInactiveSessions using configured TTL and batch size', async () => {
    const dbService = {
      purgeInactiveSessions: jasmine.createSpy('purgeInactiveSessions').and.resolveTo({ purgedSessions: 3 }),
    };
    const mockConfig = {
      SESSION_INACTIVITY_TTL_DAYS: 7,
      SESSION_CLEANUP_BATCH_SIZE: 500,
      SESSION_CLEANUP_ENABLED: true,
    };

    const worker = new SessionCleanupWorker({ dbService, cfg: mockConfig });
    const result = await worker.runCleanup();

    expect(dbService.purgeInactiveSessions).toHaveBeenCalledWith(7, 500);
    expect(result).toEqual({ purgedSessions: 3 });
  });

  it('skips cleanup when SESSION_CLEANUP_ENABLED is set to false', async () => {
    const dbService = {
      purgeInactiveSessions: jasmine.createSpy('purgeInactiveSessions'),
    };
    const mockConfig = {
      SESSION_INACTIVITY_TTL_DAYS: 7,
      SESSION_CLEANUP_BATCH_SIZE: 500,
      SESSION_CLEANUP_ENABLED: false,
    };

    const worker = new SessionCleanupWorker({ dbService, cfg: mockConfig });
    const result = await worker.runCleanup();

    expect(dbService.purgeInactiveSessions).not.toHaveBeenCalled();
    expect(result).toEqual({ purgedSessions: 0, disabled: true });
  });

  it('handles database cleanup errors gracefully without throwing', async () => {
    const dbService = {
      purgeInactiveSessions: jasmine.createSpy('purgeInactiveSessions').and.rejectWith(new Error('DB failure')),
    };
    const mockConfig = {
      SESSION_INACTIVITY_TTL_DAYS: 7,
      SESSION_CLEANUP_BATCH_SIZE: 500,
      SESSION_CLEANUP_ENABLED: true,
    };

    const worker = new SessionCleanupWorker({ dbService, cfg: mockConfig });
    const result = await worker.runCleanup();

    expect(result).toEqual({ purgedSessions: 0, error: 'DB failure' });
  });
});

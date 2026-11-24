import databaseService from '../db/postgres.js';
import { getSessionsConfig } from '../config.js';
import { info, warn, error } from '../utils/logger.js';

export class SessionCleanupWorker {
  constructor({ dbService = databaseService, cfg = null } = {}) {
    this.db = dbService;
    this.cfg = cfg;
    this.timer = null;
    this.isCleaning = false;
  }

  getConfig() {
    if (this.cfg) return this.cfg;
    const sessions = getSessionsConfig() || {};
    return {
      SESSION_INACTIVITY_TTL_DAYS: sessions.inactivityTtlDays,
      SESSION_CLEANUP_BATCH_SIZE: sessions.cleanupBatchSize,
      SESSION_CLEANUP_ENABLED: sessions.cleanupEnabled,
    };
  }

  async runCleanup() {
    if (this.isCleaning) {
      return { purgedSessions: 0, skipped: true };
    }

    this.isCleaning = true;
    try {
      const activeConfig = this.getConfig();
      const ttlDays = activeConfig?.SESSION_INACTIVITY_TTL_DAYS ?? 7;
      const batchSize = activeConfig?.SESSION_CLEANUP_BATCH_SIZE ?? 500;
      const enabled = activeConfig?.SESSION_CLEANUP_ENABLED ?? true;

      if (!enabled) {
        return { purgedSessions: 0, disabled: true };
      }

      info('Starting session cleanup execution', { ttlDays, batchSize });
      const result = await this.db.purgeInactiveSessions(ttlDays, batchSize);

      if (result?.purgedSessions > 0) {
        info('Session cleanup cycle completed', { purgedSessions: result.purgedSessions });
      }

      return result;
    } catch (err) {
      warn('Session cleanup worker error', { error: err.message });
      return { purgedSessions: 0, error: err.message };
    } finally {
      this.isCleaning = false;
    }
  }

  startScheduledWorker(intervalMs = 24 * 60 * 60 * 1000) {
    if (this.timer) {
      return;
    }

    // Run initial cleanup cycle asynchronously (non-blocking)
    this.runCleanup().catch((err) => {
      warn('Initial session cleanup error', { error: err.message });
    });

    this.timer = setInterval(() => {
      this.runCleanup().catch((err) => {
        warn('Scheduled session cleanup error', { error: err.message });
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  start() {
    this.startScheduledWorker();
  }

  stop() {
    this.stopScheduledWorker();
  }

  stopScheduledWorker() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

const sessionCleanupWorker = new SessionCleanupWorker();
export default sessionCleanupWorker;

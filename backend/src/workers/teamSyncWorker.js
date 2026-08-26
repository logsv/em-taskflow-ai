/**
 * Node.js Parallel Background Team Sync Worker
 * Orchestrates parallel per-tool activities (GitHub, Jira, Notion, GCal)
 * and continuously syncs team roster into PostgreSQL taskflow_backend.
 */

import identityService from '../services/identityService.js';
import settingsService from '../services/settingsService.js';
import { info, warn, error, debug } from '../utils/logger.js';

class TeamSyncWorker {
  constructor() {
    this.intervalHandle = null;
    this.warmupTimeoutHandle = null;
    this.isRunning = false;
    this.lastRunAt = null;
    this.lastRunStatus = 'IDLE';
    this.syncIntervalMs = 6 * 60 * 60 * 1000; // 6 hours
  }

  /**
   * Starts background recurring sync loop.
   */
  start(intervalMs = this.syncIntervalMs) {
    this.stop();
    this.syncIntervalMs = intervalMs;

    info({ module: 'teamSyncWorker', action: 'start', intervalMinutes: this.syncIntervalMs / 1000 / 60 }, `Started Node.js team sync worker (Interval: ${this.syncIntervalMs / 1000 / 60}m)`);

    // Run initial sync non-blocking on startup after 5s warm-up
    this.warmupTimeoutHandle = setTimeout(() => {
      this.executeParallelSync().catch(err => {
        warn({ module: 'teamSyncWorker', action: 'initialSyncFallback', err }, 'Initial team sync warning');
      });
    }, 5000);

    this.intervalHandle = setInterval(() => {
      this.executeParallelSync().catch(err => {
        warn({ module: 'teamSyncWorker', action: 'scheduledSyncFallback', err }, 'Scheduled team sync warning');
      });
    }, this.syncIntervalMs);
  }

  /**
   * Stops background sync worker.
   */
  stop() {
    if (this.warmupTimeoutHandle) {
      clearTimeout(this.warmupTimeoutHandle);
      this.warmupTimeoutHandle = null;
    }
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      debug({ module: 'teamSyncWorker', action: 'stop' }, 'Stopped Node.js team sync worker');
    }
    this.isRunning = false;
  }

  /**
   * Executes 1-click or scheduled parallel harvesting across all tools.
   */
  async executeParallelSync() {
    if (this.isRunning) {
      debug({ module: 'teamSyncWorker', action: 'executeParallelSync' }, 'Team sync already in progress, skipping concurrent run');
      return { status: 'IN_PROGRESS' };
    }

    this.isRunning = true;
    this.lastRunAt = new Date().toISOString();
    this.lastRunStatus = 'RUNNING';

    const startTime = Date.now();
    info({ module: 'teamSyncWorker', action: 'executeParallelSyncStart' }, 'Executing parallel team auto-discovery across GitHub, Jira, Notion, and Google Calendar');

    try {
      // 1. Ensure latest MCP settings are loaded
      await settingsService.initialize();
      const rawSettings = settingsService.cachedRawSettings;

      // 2. Execute parallel harvesting & identity reconciliation in Node.js
      const syncResult = await identityService.autoDiscoverAndSync();

      const durationMs = Date.now() - startTime;
      this.lastRunStatus = 'SUCCESS';
      info({ module: 'teamSyncWorker', action: 'executeParallelSyncSuccess', durationMs, syncedCount: syncResult.syncedCount }, `Team sync complete in ${durationMs}ms: ${syncResult.syncedCount} members reconciled & persisted into PostgreSQL`);

      return {
        status: 'SUCCESS',
        syncedCount: syncResult.syncedCount,
        syncedAt: syncResult.syncedAt,
        durationMs,
        members: syncResult.members,
      };
    } catch (err) {
      this.lastRunStatus = 'ERROR';
      error({ module: 'teamSyncWorker', action: 'executeParallelSyncError', err }, 'Team sync failed');
      throw err;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Returns worker status for Admin UI & Health APIs.
   */
  getStatus() {
    return {
      worker: 'Node.js Parallel TeamSyncWorker',
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      lastRunStatus: this.lastRunStatus,
      intervalMinutes: Math.round(this.syncIntervalMs / 1000 / 60),
    };
  }
}

export const teamSyncWorker = new TeamSyncWorker();
export default teamSyncWorker;

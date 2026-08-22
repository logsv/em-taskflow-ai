/**
 * Node.js Parallel Background Team Sync Worker
 * Orchestrates parallel per-tool activities (GitHub, Jira, Notion, GCal)
 * and continuously syncs team roster into PostgreSQL taskflow_backend.
 */

import identityService from '../services/identityService.js';
import settingsService from '../services/settingsService.js';

class TeamSyncWorker {
  constructor() {
    this.intervalHandle = null;
    this.isRunning = false;
    this.lastRunAt = null;
    this.lastRunStatus = 'IDLE';
    this.syncIntervalMs = 6 * 60 * 60 * 1000; // 6 hours
  }

  /**
   * Starts background recurring sync loop.
   */
  start(intervalMs = this.syncIntervalMs) {
    this.syncIntervalMs = intervalMs;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }

    console.log(`⏱️ [TeamSyncWorker] Started Node.js team sync worker (Interval: ${this.syncIntervalMs / 1000 / 60}m)`);

    // Run initial sync non-blocking on startup after 5s warm-up
    setTimeout(() => {
      this.executeParallelSync().catch(err => {
        console.warn(`⚠️ [TeamSyncWorker] Initial sync warning: ${err.message}`);
      });
    }, 5000);

    this.intervalHandle = setInterval(() => {
      this.executeParallelSync().catch(err => {
        console.warn(`⚠️ [TeamSyncWorker] Scheduled sync warning: ${err.message}`);
      });
    }, this.syncIntervalMs);
  }

  /**
   * Stops background sync worker.
   */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('⏹️ [TeamSyncWorker] Stopped Node.js team sync worker');
    }
  }

  /**
   * Executes 1-click or scheduled parallel harvesting across all tools.
   */
  async executeParallelSync() {
    if (this.isRunning) {
      console.log('⏳ [TeamSyncWorker] Team sync already in progress, skipping concurrent run.');
      return { status: 'IN_PROGRESS' };
    }

    this.isRunning = true;
    this.lastRunAt = new Date().toISOString();
    this.lastRunStatus = 'RUNNING';

    const startTime = Date.now();
    console.log('🚀 [TeamSyncWorker] Executing parallel team auto-discovery across GitHub, Jira, Notion, and Google Calendar...');

    try {
      // 1. Ensure latest MCP settings are loaded
      await settingsService.initialize();
      const rawSettings = settingsService.cachedRawSettings;

      // 2. Execute parallel harvesting & identity reconciliation in Node.js
      const syncResult = await identityService.autoDiscoverAndSync();

      const durationMs = Date.now() - startTime;
      this.lastRunStatus = 'SUCCESS';
      console.log(`✅ [TeamSyncWorker] Team sync complete in ${durationMs}ms: ${syncResult.syncedCount} members reconciled & persisted into PostgreSQL`);

      return {
        status: 'SUCCESS',
        syncedCount: syncResult.syncedCount,
        syncedAt: syncResult.syncedAt,
        durationMs,
        members: syncResult.members,
      };
    } catch (err) {
      this.lastRunStatus = 'ERROR';
      console.error(`❌ [TeamSyncWorker] Team sync failed: ${err.message}`);
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

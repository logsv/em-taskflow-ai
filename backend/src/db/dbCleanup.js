import databaseService from './postgres.js';
import { info, warn, error } from '../utils/logger.js';

/**
 * List of state/data tables to clean during database resets.
 * NOTE: 'app_settings' is deliberately EXCLUDED to preserve tool API keys and configuration.
 */
export const DEFAULT_CLEANUP_TABLES = [
  'em_action_items',
  'em_audit_runs',
  'sbi_feedback_records',
  'okr_tracker',
  'sprint_analytics',
  'dora_snapshots',
  'github_issues',
  'chat_messages',
  'chat_threads',
  'sessions',
];

/**
 * Safely cleans data and cache tables from PostgreSQL while strictly preserving app_settings.
 * 
 * @param {Object} options Options for cleanup
 * @param {boolean} [options.preserveSettings=true] If true, app_settings table is never touched
 * @param {Array<string>} [options.tables] Specific tables to clean (defaults to DEFAULT_CLEANUP_TABLES)
 * @returns {Promise<Object>} Summary of cleaned tables and row counts
 */
export async function cleanupDatabaseTables(options = {}) {
  const { preserveSettings = true, tables = DEFAULT_CLEANUP_TABLES } = options;

  info({ module: 'dbCleanup', preserveSettings, tables }, '🧹 Starting safe database cleanup...');

  // Ensure app_settings is never in the cleanup list if preserveSettings is true
  const safeTables = preserveSettings 
    ? tables.filter((t) => t !== 'app_settings') 
    : tables;

  const result = {
    success: true,
    preservedSettings: preserveSettings,
    cleanedTables: [],
    errors: [],
    timestamp: new Date().toISOString(),
  };

  // 1. Clean PostgreSQL tables if database is connected
  try {
    await databaseService.ensureInitialized().catch(() => {});

    if (databaseService.pool) {
      for (const table of safeTables) {
        try {
          await databaseService.pool.query(`TRUNCATE TABLE ${table} CASCADE`);
          result.cleanedTables.push(table);
          info({ module: 'dbCleanup', table }, `✅ Truncated table: ${table}`);
        } catch (err) {
          // Table might not exist yet; log and continue
          warn({ module: 'dbCleanup', table, error: err.message }, `⚠️ Could not truncate table: ${table}`);
          result.errors.push({ table, error: err.message });
        }
      }
    }
  } catch (dbErr) {
    error({ module: 'dbCleanup', error: dbErr.message }, '❌ Database pool error during cleanup');
    result.errors.push({ database: dbErr.message });
  }

  // 2. Clear in-memory fallbacks on databaseService
  try {
    databaseService.inMemoryActionItems = [];
    databaseService.inMemoryAuditRuns = [];
    databaseService.inMemorySbiRecords = [];
    databaseService.inMemoryOkrTracker = [];
    databaseService.inMemorySprintAnalytics = [];
    databaseService.inMemoryDoraSnapshots = [];
    databaseService.inMemoryGithubIssues = [];
    databaseService.inMemorySessions = [];
    databaseService.inMemoryChatThreads = [];
    databaseService.inMemoryChatMessages = [];
    info({ module: 'dbCleanup' }, '✅ Cleared all in-memory fallback stores');
  } catch (memErr) {
    warn({ module: 'dbCleanup', error: memErr.message }, '⚠️ Error clearing in-memory stores');
  }

  info({ module: 'dbCleanup', summary: result }, '🎉 Database cleanup complete.');
  return result;
}

export default cleanupDatabaseTables;

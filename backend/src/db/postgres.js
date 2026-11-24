import { Pool } from 'pg';
import { getDatabaseConfig } from '../config.js';
import { warn, error } from '../utils/logger.js';
import { swallow } from '../core/safe.js';
import { runMigrations } from './migrator.js';
import { safeJsonParse, createOpaqueId } from './rowMappers.js';
import { ChatRepository } from './repositories/chat.js';
import { LegacyRepository } from './repositories/legacy.js';
import { GithubRepository } from './repositories/github.js';
import { DocumentRepository } from './repositories/documents.js';
import { MetricsRepository } from './repositories/metrics.js';
import { SettingsRepository } from './repositories/settings.js';
import { TeamRepository } from './repositories/team.js';
import { AuditRepository } from './repositories/audit.js';
import { applyMixins } from './repositories/mixin.js';

export { SEEDED_PLACEHOLDER_KEY_RESULTS } from './repositories/metrics.js';

/**
 * PostgreSQL access for taskflow_backend. Connection, migrations and transactions live here;
 * table-specific methods live in ./repositories/* and are mixed in below, so callers keep
 * using `db.someMethod()`.
 */
class DatabaseService {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.initializing = null;
    this.inMemoryDoraSnapshots = [];
    this.inMemorySbiRecords = [];
    this.inMemorySprintAnalytics = [];
    this.inMemoryOkrTracker = [];
    this.inMemoryAppSettings = {};
    this.inMemoryTeamMembers = [];
    this.inMemoryAuditRuns = [];
    this.inMemoryActionItems = [];
  }

  async initialize() {
    if (this.initialized && this.pool) {
      return;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = (async () => {
      const databaseConfig = getDatabaseConfig();
      const rawPool = new Pool({
        connectionString: databaseConfig.url,
      });

      // Strict Defense-in-Depth query guard protecting app_settings from destructive wipes
      const originalQuery = rawPool.query.bind(rawPool);
      rawPool.query = async (text, params) => {
        const queryStr = typeof text === 'string' ? text : text?.text || '';
        if (
          /TRUNCATE\s+(TABLE\s+)?app_settings/i.test(queryStr) ||
          /DROP\s+TABLE\s+(IF\s+EXISTS\s+)?app_settings/i.test(queryStr) ||
          /DELETE\s+FROM\s+app_settings\s*(;|\s*$)/i.test(queryStr)
        ) {
          warn('PostgreSQL query guard: Blocked destructive wipe query against app_settings table', { query: queryStr });
          return { rows: [], rowCount: 0, command: 'BLOCKED' };
        }
        return originalQuery(text, params);
      };

      this.pool = rawPool;

      await this.pool.query('SELECT 1');
      await this.createTables();
      await this.purgeSeededPlaceholderOkrs().catch((err) => warn('Placeholder OKR cleanup failed', { err: err.message }));
      this.initialized = true;
      this.initializing = null;
    })().catch((error) => {
      this.initialized = false;
      this.initializing = null;
      this.pool = null;
      throw error;
    });

    return this.initializing;
  }

  async ensureInitialized() {
    if (this.initialized && this.pool) {
      return;
    }
    await this.initialize();
  }

  /** Apply schema migrations (src/db/migrations). Kept under this name for existing callers. */
  async createTables() {
    await this.ensurePool();
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements').catch(swallow('db.postgres.pgStatStatements'));
    return runMigrations(this.pool);
  }

  /**
   * Run fn(client) in one transaction. Rolls back and rethrows on any error.
   * @template T
   * @param {(client: import('pg').PoolClient) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withTransaction(fn) {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(swallow('db.postgres.rollback'));
      throw err;
    } finally {
      client.release();
    }
  }

  async createFeedback({
    sessionId = null,
    threadId = null,
    messageId = null,
    traceId = null,
    score,
    comment = null,
    metadata = null,
  }) {
    await this.ensureInitialized();
    if (!score) {
      throw new Error('score is required to create feedback');
    }

    const feedbackId = createOpaqueId('fb');
    const normalizedMetadata =
      metadata == null ? null : typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

    try {
      await this.pool.query(
        `
          INSERT INTO feedback (id, session_id, thread_id, message_id, trace_id, score, comment, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [feedbackId, sessionId, threadId, messageId, traceId, score, comment, normalizedMetadata],
      );
    } catch (dbErr) {
      if (dbErr.code === '23503') {
        await this.pool.query(
          `
            INSERT INTO feedback (id, session_id, thread_id, message_id, trace_id, score, comment, metadata)
            VALUES ($1, NULL, NULL, NULL, $2, $3, $4, $5)
          `,
          [feedbackId, traceId, score, comment, normalizedMetadata],
        );
      } else {
        throw dbErr;
      }
    }

    return {
      id: feedbackId,
      sessionId,
      threadId,
      messageId,
      traceId,
      score,
      comment,
      metadata: normalizedMetadata ? safeJsonParse(normalizedMetadata) : null,
    };
  }

  close() {
    if (!this.pool) {
      return;
    }

    this.pool.end().catch((err) => {
      error({ module: 'postgres', action: 'closePool', err }, 'Error closing Postgres pool');
    });
    this.pool = null;
    this.initialized = false;
    this.initializing = null;
  }

  async ensurePool() {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
  }
}

applyMixins(DatabaseService, ChatRepository, LegacyRepository, GithubRepository, DocumentRepository, MetricsRepository, SettingsRepository, TeamRepository, AuditRepository);

const databaseService = new DatabaseService();
export default databaseService;

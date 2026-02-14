import { Pool } from 'pg';
import { getDatabaseConfig } from '../config.js';

class DatabaseService {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.initializing = null;
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
      this.pool = new Pool({
        connectionString: databaseConfig.url,
      });

      await this.pool.query('SELECT 1');
      await this.createTables();
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

  async createTables() {
    await this.ensurePool();

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        strategy TEXT,
        executor_path TEXT,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id BIGSERIAL PRIMARY KEY,
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        session_id TEXT,
        metadata TEXT
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id BIGSERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS task_cache (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        task_id TEXT NOT NULL,
        data TEXT NOT NULL,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(source, task_id)
      );
    `);
  }

  async createThread(title = 'New Chat') {
    await this.ensureInitialized();
    const threadId = `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await this.pool.query(
      `
        INSERT INTO chat_threads (id, title)
        VALUES ($1, $2)
      `,
      [threadId, title],
    );
    return { id: threadId, title };
  }

  async ensureThread(threadId, title = 'New Chat') {
    await this.ensureInitialized();
    if (!threadId) {
      return this.createThread(title);
    }

    const existing = await this.pool.query(
      `
        SELECT id, title
        FROM chat_threads
        WHERE id = $1
        LIMIT 1
      `,
      [threadId],
    );

    if (existing.rowCount > 0) {
      return existing.rows[0];
    }

    await this.pool.query(
      `
        INSERT INTO chat_threads (id, title)
        VALUES ($1, $2)
      `,
      [threadId, title],
    );
    return { id: threadId, title };
  }

  async saveMessage({ threadId, role, content, strategy = null, executorPath = null, metadata = null }) {
    await this.ensureInitialized();
    if (!threadId) {
      throw new Error('threadId is required to save message');
    }

    const normalizedMetadata =
      metadata == null ? null : typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

    const result = await this.pool.query(
      `
        INSERT INTO chat_messages (thread_id, role, content, strategy, executor_path, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [threadId, role, content, strategy, executorPath, normalizedMetadata],
    );

    await this.pool.query(
      `
        UPDATE chat_threads
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [threadId],
    );

    return { id: result.rows[0].id };
  }

  async listThreads(limit = 50) {
    await this.ensureInitialized();
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Number(limit)) : 50;
    const result = await this.pool.query(
      `
        SELECT
          t.id,
          t.title,
          t.created_at,
          t.updated_at,
          (
            SELECT m.content
            FROM chat_messages m
            WHERE m.thread_id = t.id AND m.role = 'user'
            ORDER BY m.created_at DESC
            LIMIT 1
          ) AS last_user_message
        FROM chat_threads t
        ORDER BY t.updated_at DESC
        LIMIT $1
      `,
      [safeLimit],
    );
    return result.rows;
  }

  async getThreadMessages(threadId, limit = 100) {
    await this.ensureInitialized();
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Number(limit)) : 100;
    const result = await this.pool.query(
      `
        SELECT id, thread_id, role, content, strategy, executor_path, metadata, created_at
        FROM chat_messages
        WHERE thread_id = $1
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [threadId, safeLimit],
    );
    return result.rows.map((row) => ({
      ...row,
      metadata: row.metadata ? safeJsonParse(row.metadata) : null,
    }));
  }

  async saveChatHistory(userMessage, aiResponse, sessionId = null, metadata = null) {
    await this.ensureInitialized();
    const normalizedMetadata =
      metadata == null ? null : typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

    const result = await this.pool.query(
      `
        INSERT INTO chat_history (user_message, ai_response, session_id, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [userMessage, aiResponse, sessionId, normalizedMetadata],
    );

    return { id: result.rows[0].id };
  }

  async getChatHistory(limit = 50, sessionId = null) {
    await this.ensureInitialized();
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Number(limit)) : 50;

    const result = sessionId
      ? await this.pool.query(
          `
            SELECT id, user_message, ai_response, timestamp, session_id, metadata
            FROM chat_history
            WHERE session_id = $1
            ORDER BY timestamp DESC
            LIMIT $2
          `,
          [sessionId, safeLimit],
        )
      : await this.pool.query(
          `
            SELECT id, user_message, ai_response, timestamp, session_id, metadata
            FROM chat_history
            ORDER BY timestamp DESC
            LIMIT $1
          `,
          [safeLimit],
        );

    return result.rows.reverse();
  }

  async cacheTaskData(source, taskId, data) {
    await this.ensureInitialized();
    const result = await this.pool.query(
      `
        INSERT INTO task_cache (source, task_id, data, last_updated)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (source, task_id)
        DO UPDATE SET data = EXCLUDED.data, last_updated = NOW()
        RETURNING id
      `,
      [source, taskId, JSON.stringify(data)],
    );

    return { id: result.rows[0].id };
  }

  async getCachedTaskData(source, maxAge = 3600) {
    await this.ensureInitialized();
    const safeMaxAge = Number.isFinite(maxAge) ? Math.max(1, Number(maxAge)) : 3600;

    const result = await this.pool.query(
      `
        SELECT id, source, task_id, data, last_updated
        FROM task_cache
        WHERE source = $1
        AND last_updated > NOW() - make_interval(secs => $2::int)
        ORDER BY last_updated DESC
      `,
      [source, safeMaxAge],
    );

    return result.rows.map((row) => ({
      ...row,
      data: JSON.parse(row.data),
    }));
  }

  async setUserPreference(key, value) {
    await this.ensureInitialized();
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    await this.pool.query(
      `
        INSERT INTO user_preferences (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [key, serializedValue],
    );

    return { key, value };
  }

  async getUserPreference(key) {
    await this.ensureInitialized();
    const result = await this.pool.query(
      `SELECT value FROM user_preferences WHERE key = $1`,
      [key],
    );

    if (result.rowCount === 0) {
      return null;
    }

    const raw = result.rows[0].value;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw;
    }
  }

  async getStats() {
    await this.ensureInitialized();
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM chat_threads)::int AS "chatThreads",
        (SELECT COUNT(*) FROM chat_messages)::int AS "chatMessages",
        (SELECT COUNT(*) FROM chat_history)::int AS "chatHistory",
        (SELECT COUNT(*) FROM task_cache)::int AS "cachedTasks",
        (SELECT COUNT(*) FROM user_preferences)::int AS "userPreferences"
    `);

    return result.rows[0];
  }

  close() {
    if (!this.pool) {
      return;
    }

    this.pool.end().catch((error) => {
      console.error('Error closing Postgres pool:', error);
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

const databaseService = new DatabaseService();
export default databaseService;

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

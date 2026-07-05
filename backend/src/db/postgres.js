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
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        active_thread_id TEXT,
        client_info TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
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
        trace_id TEXT,
        citations_json TEXT,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL,
        message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
        trace_id TEXT,
        score TEXT NOT NULL,
        comment TEXT,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE chat_threads
      ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
    `);

    await this.pool.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS trace_id TEXT;
    `);

    await this.pool.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS citations_json TEXT;
    `);

    await this.pool.query(`
      ALTER TABLE sessions
      ADD CONSTRAINT sessions_active_thread_fk
      FOREIGN KEY (active_thread_id)
      REFERENCES chat_threads(id)
      ON DELETE SET NULL;
    `).catch((error) => {
      if (!String(error?.message || '').includes('already exists')) {
        throw error;
      }
    });

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

  async createSession(clientInfo = null) {
    await this.ensureInitialized();
    const sessionId = createOpaqueId('sess');
    const normalizedClientInfo =
      clientInfo == null ? null : typeof clientInfo === 'string' ? clientInfo : JSON.stringify(clientInfo);

    await this.pool.query(
      `
        INSERT INTO sessions (id, client_info)
        VALUES ($1, $2)
      `,
      [sessionId, normalizedClientInfo],
    );

    return {
      id: sessionId,
      active_thread_id: null,
      client_info: normalizedClientInfo ? safeJsonParse(normalizedClientInfo) : null,
    };
  }

  async getSession(sessionId) {
    await this.ensureInitialized();
    if (!sessionId) {
      return null;
    }

    const result = await this.pool.query(
      `
        SELECT id, active_thread_id, client_info, created_at, updated_at
        FROM sessions
        WHERE id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return normalizeSessionRow(result.rows[0]);
  }

  async ensureSession(sessionId, clientInfo = null) {
    await this.ensureInitialized();
    const existing = await this.getSession(sessionId);
    if (existing) {
      await this.touchSession(existing.id);
      return existing;
    }
    return this.createSession(clientInfo);
  }

  async touchSession(sessionId) {
    await this.ensureInitialized();
    if (!sessionId) {
      return;
    }

    await this.pool.query(
      `
        UPDATE sessions
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [sessionId],
    );
  }

  async setActiveThread(sessionId, threadId) {
    await this.ensureInitialized();
    if (!sessionId) {
      throw new Error('sessionId is required to set active thread');
    }

    await this.pool.query(
      `
        UPDATE sessions
        SET active_thread_id = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [sessionId, threadId || null],
    );
  }

  async createThread(title = 'New Chat') {
    return this.createThreadForSession(null, title);
  }

  async createThreadForSession(sessionId = null, title = 'New Chat') {
    await this.ensureInitialized();
    const threadId = createOpaqueId('th');
    await this.pool.query(
      `
        INSERT INTO chat_threads (id, session_id, title)
        VALUES ($1, $2, $3)
      `,
      [threadId, sessionId, title],
    );
    if (sessionId) {
      await this.setActiveThread(sessionId, threadId);
    }
    return { id: threadId, session_id: sessionId, title };
  }

  async ensureThread(threadId, title = 'New Chat', sessionId = null) {
    await this.ensureInitialized();
    if (!threadId) {
      return this.createThreadForSession(sessionId, title);
    }

    const existing = await this.pool.query(
      `
        SELECT id, session_id, title
        FROM chat_threads
        WHERE id = $1
        LIMIT 1
      `,
      [threadId],
    );

    if (existing.rowCount > 0) {
      if (sessionId && !existing.rows[0].session_id) {
        await this.pool.query(
          `
            UPDATE chat_threads
            SET session_id = $2, updated_at = NOW()
            WHERE id = $1
          `,
          [threadId, sessionId],
        );
        await this.setActiveThread(sessionId, threadId);
        return { ...existing.rows[0], session_id: sessionId };
      }
      return existing.rows[0];
    }

    await this.pool.query(
      `
        INSERT INTO chat_threads (id, session_id, title)
        VALUES ($1, $2, $3)
      `,
      [threadId, sessionId, title],
    );
    if (sessionId) {
      await this.setActiveThread(sessionId, threadId);
    }
    return { id: threadId, session_id: sessionId, title };
  }

  async getOrCreateActiveThread(sessionId, title = 'New Chat') {
    await this.ensureInitialized();
    if (!sessionId) {
      return this.createThread(title);
    }

    const session = await this.ensureSession(sessionId);
    if (session.active_thread_id) {
      const existing = await this.ensureThread(session.active_thread_id, title, session.id);
      await this.touchSession(session.id);
      return existing;
    }

    return this.createThreadForSession(session.id, title);
  }

  async saveMessage({
    threadId,
    role,
    content,
    strategy = null,
    executorPath = null,
    traceId = null,
    citations = null,
    metadata = null,
  }) {
    await this.ensureInitialized();
    if (!threadId) {
      throw new Error('threadId is required to save message');
    }

    const normalizedMetadata =
      metadata == null ? null : typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    const normalizedCitations =
      citations == null ? null : typeof citations === 'string' ? citations : JSON.stringify(citations);

    const result = await this.pool.query(
      `
        INSERT INTO chat_messages (thread_id, role, content, strategy, executor_path, trace_id, citations_json, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [threadId, role, content, strategy, executorPath, traceId, normalizedCitations, normalizedMetadata],
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
             , trace_id, citations_json
        FROM chat_messages
        WHERE thread_id = $1
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [threadId, safeLimit],
    );
    return result.rows.map((row) => ({
      ...row,
      citations: row.citations_json ? safeJsonParse(row.citations_json) : null,
      metadata: row.metadata ? safeJsonParse(row.metadata) : null,
    }));
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

    await this.pool.query(
      `
        INSERT INTO feedback (id, session_id, thread_id, message_id, trace_id, score, comment, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [feedbackId, sessionId, threadId, messageId, traceId, score, comment, normalizedMetadata],
    );

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
        (SELECT COUNT(*) FROM sessions)::int AS "sessions",
        (SELECT COUNT(*) FROM chat_threads)::int AS "chatThreads",
        (SELECT COUNT(*) FROM chat_messages)::int AS "chatMessages",
        (SELECT COUNT(*) FROM chat_history)::int AS "chatHistory",
        (SELECT COUNT(*) FROM feedback)::int AS "feedback",
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

function createOpaqueId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSessionRow(row) {
  return {
    ...row,
    client_info: row.client_info ? safeJsonParse(row.client_info) : null,
  };
}

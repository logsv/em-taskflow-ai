import { Pool } from 'pg';
import { getDatabaseConfig } from '../config.js';
import pythonAIServiceClient from '../grpc/client.js';
import { info, warn, error } from '../utils/logger.js';

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
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    `).catch((err) => {
      warn('Failed to enable pg_stat_statements extension', { err: err.message });
    });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        active_thread_id TEXT,
        client_info TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_active_at TIMESTAMPTZ DEFAULT NOW()
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
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_last_active_at ON sessions(last_active_at);
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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS github_issues (
        id TEXT PRIMARY KEY,
        issue_number INT NOT NULL,
        repo TEXT NOT NULL,
        title TEXT NOT NULL,
        state TEXT NOT NULL,
        assignee TEXT,
        html_url TEXT,
        labels_json JSONB,
        data_json JSONB NOT NULL,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_github_issues_repo_state ON github_issues(repo, state);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pdf_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        chunk_index INT NOT NULL,
        content TEXT NOT NULL,
        parent_content TEXT NOT NULL,
        embedding_json TEXT,
        tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content || ' ' || filename)) STORED,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pdf_chunks_filename ON pdf_chunks(filename);
      CREATE INDEX IF NOT EXISTS idx_pdf_chunks_tsv ON pdf_chunks USING GIN(tsv);

      CREATE TABLE IF NOT EXISTS dora_snapshots (
        id SERIAL PRIMARY KEY,
        team_id VARCHAR(64) NOT NULL,
        deployment_frequency NUMERIC(5,2),
        lead_time_hours NUMERIC(8,2),
        change_failure_rate NUMERIC(5,2),
        mttr_hours NUMERIC(8,2),
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sbi_feedback_records (
        id SERIAL PRIMARY KEY,
        engineer_id VARCHAR(64) NOT NULL,
        situation TEXT NOT NULL,
        behavior TEXT NOT NULL,
        impact TEXT NOT NULL,
        action_plan TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sprint_analytics (
        id SERIAL PRIMARY KEY,
        sprint_id VARCHAR(64) UNIQUE NOT NULL,
        total_points INT DEFAULT 0,
        completed_points INT DEFAULT 0,
        wip_violations INT DEFAULT 0,
        retro_action_items JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS okr_tracker (
        id SERIAL PRIMARY KEY,
        objective TEXT NOT NULL,
        key_result TEXT NOT NULL,
        target_value NUMERIC(10,2) NOT NULL,
        current_value NUMERIC(10,2) DEFAULT 0,
        status VARCHAR(32) DEFAULT 'ON_TRACK',
        quarter VARCHAR(16) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        source TEXT DEFAULT 'database',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT UNIQUE,
        aliases JSONB DEFAULT '[]',
        github_username TEXT,
        jira_email TEXT,
        jira_account_id TEXT,
        gcal_email TEXT,
        notion_name TEXT,
        current_level TEXT DEFAULT 'L4_MID',
        target_level TEXT DEFAULT 'L5_SENIOR',
        track TEXT DEFAULT 'INDIVIDUAL_CONTRIBUTOR',
        tenure_months INT DEFAULT 12,
        skills JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
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
        SELECT id, active_thread_id, client_info, created_at, updated_at, last_active_at
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
        SET updated_at = NOW(), last_active_at = NOW()
        WHERE id = $1
      `,
      [sessionId],
    );
  }

  async listSessions({ limit = 10, page = 1, offset = null } = {}) {
    await this.ensureInitialized();
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const safePage = Math.max(1, Number(page) || 1);
    const safeOffset = offset != null ? Math.max(0, Number(offset)) : (safePage - 1) * safeLimit;

    if (!this.pool) {
      const allSessions = Array.from(inMemorySessions.values()).sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
      );
      const total = allSessions.length;
      const sliced = allSessions.slice(safeOffset, safeOffset + safeLimit);
      return {
        sessions: sliced.map((s) => ({
          id: s.id,
          active_thread_id: s.active_thread_id,
          active_thread_title: 'New Chat',
          created_at: s.created_at,
          updated_at: s.updated_at,
          last_active_at: s.last_active_at || s.updated_at || s.created_at,
          thread_count: Array.from(inMemoryThreads.values()).filter((t) => t.session_id === s.id).length,
          last_message: null,
        })),
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit) || 1,
          hasNext: safeOffset + safeLimit < total,
          hasPrev: safePage > 1,
        },
      };
    }

    try {
      const result = await this.pool.query(
        `
          WITH session_agg AS (
            SELECT
              s.id,
              s.active_thread_id,
              s.client_info,
              s.created_at,
              s.updated_at,
              s.last_active_at,
              COUNT(t.id)::int AS thread_count,
              (
                SELECT m.content
                FROM chat_messages m
                JOIN chat_threads ct ON m.thread_id = ct.id
                WHERE ct.session_id = s.id
                ORDER BY m.created_at DESC
                LIMIT 1
              ) AS last_message,
              (
                SELECT ct.title
                FROM chat_threads ct
                WHERE ct.id = s.active_thread_id
                LIMIT 1
              ) AS active_thread_title,
              COUNT(*) OVER() AS full_count
            FROM sessions s
            LEFT JOIN chat_threads t ON t.session_id = s.id
            GROUP BY s.id
            ORDER BY COALESCE(s.last_active_at, s.updated_at, s.created_at) DESC
            LIMIT $1 OFFSET $2
          )
          SELECT * FROM session_agg
        `,
        [safeLimit, safeOffset],
      );

      const total = result.rows.length > 0 ? Number(result.rows[0].full_count) : 0;
      const sessions = result.rows.map((row) => ({
        id: row.id,
        active_thread_id: row.active_thread_id,
        active_thread_title: row.active_thread_title || 'New Chat',
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_active_at: row.last_active_at || row.updated_at || row.created_at,
        thread_count: Number(row.thread_count) || 0,
        last_message: row.last_message || null,
      }));

      return {
        sessions,
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit) || 1,
          hasNext: safeOffset + safeLimit < total,
          hasPrev: safePage > 1,
        },
      };
    } catch (err) {
      warn('PostgreSQL listSessions failed, using fallback', { err: err.message });
      return {
        sessions: [],
        pagination: { total: 0, page: safePage, limit: safeLimit, totalPages: 1, hasNext: false, hasPrev: false },
      };
    }
  }

  async listThreadsForSession(sessionId, { limit = 10, page = 1, offset = null } = {}) {
    await this.ensureInitialized();
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const safePage = Math.max(1, Number(page) || 1);
    const safeOffset = offset != null ? Math.max(0, Number(offset)) : (safePage - 1) * safeLimit;

    if (!this.pool) {
      const allThreads = Array.from(inMemoryThreads.values())
        .filter((t) => !sessionId || t.session_id === sessionId)
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      const total = allThreads.length;
      const sliced = allThreads.slice(safeOffset, safeOffset + safeLimit);
      return {
        threads: sliced,
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit) || 1,
          hasNext: safeOffset + safeLimit < total,
          hasPrev: safePage > 1,
        },
      };
    }

    try {
      const result = await this.pool.query(
        `
          SELECT
            t.id,
            t.session_id,
            t.title,
            t.created_at,
            t.updated_at,
            (
              SELECT m.content
              FROM chat_messages m
              WHERE m.thread_id = t.id
              ORDER BY m.created_at DESC
              LIMIT 1
            ) AS last_message,
            (
              SELECT COUNT(*)::int
              FROM chat_messages m
              WHERE m.thread_id = t.id
            ) AS message_count,
            COUNT(*) OVER() AS full_count
          FROM chat_threads t
          WHERE t.session_id = $1 OR ($1 IS NULL AND t.session_id IS NULL)
          ORDER BY t.updated_at DESC
          LIMIT $2 OFFSET $3
        `,
        [sessionId, safeLimit, safeOffset],
      );

      const total = result.rows.length > 0 ? Number(result.rows[0].full_count) : 0;
      const threads = result.rows.map((row) => ({
        id: row.id,
        session_id: row.session_id,
        title: row.title,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_message: row.last_message || null,
        message_count: Number(row.message_count) || 0,
      }));

      return {
        threads,
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit) || 1,
          hasNext: safeOffset + safeLimit < total,
          hasPrev: safePage > 1,
        },
      };
    } catch (err) {
      warn('PostgreSQL listThreadsForSession failed, using fallback', { err: err.message });
      return {
        threads: [],
        pagination: { total: 0, page: safePage, limit: safeLimit, totalPages: 1, hasNext: false, hasPrev: false },
      };
    }
  }

  async deleteSession(sessionId) {
    await this.ensureInitialized();
    if (!sessionId) throw new Error('sessionId is required');

    if (!this.pool) {
      inMemorySessions.delete(sessionId);
      for (const [tid, thread] of inMemoryThreads.entries()) {
        if (thread.session_id === sessionId) inMemoryThreads.delete(tid);
      }
      return { deleted: true };
    }

    try {
      await this.pool.query(
        `DELETE FROM sessions WHERE id = $1`,
        [sessionId],
      );
      return { deleted: true };
    } catch (err) {
      warn('PostgreSQL deleteSession failed', { err: err.message });
      throw err;
    }
  }

  async archiveSession(sessionId) {
    await this.ensureInitialized();
    if (!sessionId) throw new Error('sessionId is required');

    if (!this.pool) {
      const s = inMemorySessions.get(sessionId);
      if (s) { s.archived = true; s.updated_at = new Date().toISOString(); }
      return { archived: true };
    }

    try {
      // Add archived column if it doesn't exist (safe migration)
      await this.pool.query(
        `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE`,
      ).catch(() => {});
      await this.pool.query(
        `UPDATE sessions SET archived = TRUE, updated_at = NOW() WHERE id = $1`,
        [sessionId],
      );
      return { archived: true };
    } catch (err) {
      warn('PostgreSQL archiveSession failed', { err: err.message });
      throw err;
    }
  }

  async purgeInactiveSessions(ttlDays = 7, batchSize = 500) {
    await this.ensureInitialized();
    const effectiveTtl = Math.max(1, Number(ttlDays) || 7);
    const effectiveBatch = Math.max(10, Math.min(5000, Number(batchSize) || 500));

    if (!this.pool) {
      return { purgedSessions: 0 };
    }

    try {
      const selectResult = await this.pool.query(
        `
          SELECT id FROM sessions
          WHERE COALESCE(last_active_at, updated_at, created_at) < NOW() - ($1 || ' days')::INTERVAL
          LIMIT $2
        `,
        [effectiveTtl, effectiveBatch],
      );

      const sessionIds = selectResult.rows.map((r) => r.id);
      if (sessionIds.length === 0) {
        return { purgedSessions: 0 };
      }

      const deleteResult = await this.pool.query(
        `
          DELETE FROM sessions
          WHERE id = ANY($1::text[])
        `,
        [sessionIds],
      );

      return { purgedSessions: deleteResult.rowCount || sessionIds.length };
    } catch (err) {
      warn('PostgreSQL purgeInactiveSessions failed', { err: err.message });
      return { purgedSessions: 0, error: err.message };
    }
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

  async updateThreadTitle(threadId, title) {
    await this.ensureInitialized();
    if (!threadId || !title) return null;
    const cleanTitle = String(title).trim().slice(0, 100);
    if (!cleanTitle) return null;

    if (!this.pool) {
      const existing = inMemoryThreads.get(threadId);
      if (existing) {
        existing.title = cleanTitle;
        existing.updated_at = new Date().toISOString();
        return existing;
      }
      return null;
    }

    const result = await this.pool.query(
      `
        UPDATE chat_threads
        SET title = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id, session_id, title
      `,
      [threadId, cleanTitle],
    );
    return result.rows[0] || null;
  }

  async ensureThread(threadId, title = 'New Chat', sessionId = null) {
    await this.ensureInitialized();
    if (!threadId) {
      return this.createThreadForSession(sessionId, title);
    }

    if (!this.pool) {
      const existing = inMemoryThreads.get(threadId);
      if (existing) {
        if (title && title !== 'New Chat' && title !== 'Chat' && (!existing.title || existing.title === 'New Chat' || existing.title === 'Chat')) {
          existing.title = title;
          existing.updated_at = new Date().toISOString();
        }
        if (sessionId && !existing.session_id) {
          existing.session_id = sessionId;
          await this.setActiveThread(sessionId, threadId);
        }
        return existing;
      }
      const thread = {
        id: threadId,
        session_id: sessionId,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      inMemoryThreads.set(threadId, thread);
      if (sessionId) {
        await this.setActiveThread(sessionId, threadId);
      }
      return thread;
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
      const existingThread = existing.rows[0];
      if (title && title !== 'New Chat' && title !== 'Chat' && (!existingThread.title || existingThread.title === 'New Chat' || existingThread.title === 'Chat')) {
        await this.pool.query(
          `
            UPDATE chat_threads
            SET title = $2, updated_at = NOW()
            WHERE id = $1
          `,
          [threadId, title],
        );
        existingThread.title = title;
      }
      if (sessionId && !existingThread.session_id) {
        await this.pool.query(
          `
            UPDATE chat_threads
            SET session_id = $2, updated_at = NOW()
            WHERE id = $1
          `,
          [threadId, sessionId],
        );
        await this.setActiveThread(sessionId, threadId);
        return { ...existingThread, session_id: sessionId };
      }
      return existingThread;
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

  // Legacy compatibility only. Do not use for new chat flows.
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

  // Legacy compatibility only. Do not use for new chat flows.
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

  // Legacy compatibility only. Avoid introducing new task cache consumers.
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

  // Legacy compatibility only. Avoid introducing new task cache consumers.
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

  // Legacy compatibility only. OAuth providers are being isolated behind legacy repositories.
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

  // Legacy compatibility only. OAuth providers are being isolated behind legacy repositories.
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

  async upsertGithubIssues(issues) {
    if (!Array.isArray(issues) || issues.length === 0) return 0;

    if (!this.inMemoryGithubIssues) this.inMemoryGithubIssues = new Map();
    const defaultRepo = process.env.GITHUB_REPO || 'github_repo';
    for (const issue of issues) {
      const num = issue.number || issue.id;
      const targetRepo = issue.repo || defaultRepo;
      if (num) {
        this.inMemoryGithubIssues.set(String(num), {
          id: `gh_${num}`,
          number: num,
          repo: targetRepo,
          title: issue.title || 'Untitled Issue',
          state: issue.state || 'open',
          assignee: issue.assignee || 'unassigned',
          html_url: issue.html_url || `https://github.com/${targetRepo}/issues/${num}`,
          labels: issue.labels || [],
          data: issue,
          synced_at: issue.synced_at || new Date().toISOString(),
        });
      }
    }

    try {
      await this.ensureInitialized();
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const issue of issues) {
          const targetRepo = issue.repo || defaultRepo;
          const id = `gh_${targetRepo}_${issue.number}`;
          const labelsJson = JSON.stringify(issue.labels || []);
          const dataJson = JSON.stringify(issue);

          await client.query(
            `INSERT INTO github_issues (
              id, issue_number, repo, title, state, assignee, html_url, labels_json, data_json, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (id) DO UPDATE SET
              issue_number = EXCLUDED.issue_number,
              repo = EXCLUDED.repo,
              title = EXCLUDED.title,
              state = EXCLUDED.state,
              assignee = EXCLUDED.assignee,
              html_url = EXCLUDED.html_url,
              labels_json = EXCLUDED.labels_json,
              data_json = EXCLUDED.data_json,
              synced_at = NOW()`,
            [
              id,
              issue.number,
              targetRepo,
              issue.title || '',
              issue.state || 'open',
              issue.assignee || '',
              issue.html_url || `https://github.com/${targetRepo}/issues/${issue.number}`,
              labelsJson,
              dataJson,
            ]
          );
        }
        await client.query('COMMIT');
        return issues.length;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (dbErr) {
      warn("PostgreSQL github_issues upsert failed, using in-memory GitHub cache", { count: issues.length, err: dbErr.message });
      return issues.length;
    }
  }

  async getGithubIssues({ repo, state, search } = {}) {
    try {
      await this.ensureInitialized();
      let queryStr = `SELECT id, issue_number as number, repo, title, state, assignee, html_url, labels_json, data_json, synced_at FROM github_issues WHERE 1=1`;
      const params = [];

      let effectiveState = state;
      let effectiveSearch = search;

      if (search && typeof search === 'string') {
        const lowerSearch = search.toLowerCase();
        if (!effectiveState) {
          if (lowerSearch.includes('open')) effectiveState = 'open';
          else if (lowerSearch.includes('closed')) effectiveState = 'closed';
        }
        const stopWords = ['open', 'closed', 'github', 'issue', 'issues', 'pr', 'prs', 'pull-request', 'pull-requests', 'all', 'list', 'get', 'show', 'what', 'are', 'the', 'my', 'repo', 'repositories', 'tickets', 'ticket'];
        const cleanWords = lowerSearch
          .split(/\s+/)
          .filter((w) => w.length > 0 && !stopWords.includes(w));
        effectiveSearch = cleanWords.join(' ').trim();
      }

      if (repo && typeof repo === 'string' && repo.trim() !== '' && repo !== 'default' && repo !== 'all') {
        params.push(repo);
        queryStr += ` AND repo = $${params.length}`;
      }
      if (effectiveState) {
        params.push(effectiveState);
        queryStr += ` AND state = $${params.length}`;
      }
      if (effectiveSearch) {
        params.push(`%${effectiveSearch}%`);
        queryStr += ` AND (title ILIKE $${params.length} OR repo ILIKE $${params.length})`;
      }

      queryStr += ` ORDER BY issue_number DESC LIMIT 100`;

      const result = await this.pool.query(queryStr, params);
      return result.rows.map((row) => ({
        id: row.id,
        number: row.number,
        repo: row.repo,
        title: row.title,
        state: row.state,
        assignee: row.assignee,
        html_url: row.html_url,
        labels: safeJsonParse(row.labels_json),
        data: safeJsonParse(row.data_json),
        synced_at: row.synced_at,
      }));
    } catch (err) {
      warn("PostgreSQL getGithubIssues failed, using in-memory store fallback", { err: err.message });
      if (!this.inMemoryGithubIssues) return [];
      let issues = Array.from(this.inMemoryGithubIssues.values());
      if (state) {
        issues = issues.filter((i) => i.state === state);
      }
      if (search) {
        const sLower = search.toLowerCase();
        const stopWords = ['open', 'closed', 'github', 'issue', 'issues', 'pr', 'prs', 'pull-request', 'all', 'list', 'get', 'show'];
        const cleanWords = sLower.split(/\s+/).filter((w) => w.length > 0 && !stopWords.includes(w));
        if (cleanWords.length > 0) {
          const cleanSearch = cleanWords.join(' ');
          issues = issues.filter((i) => i.title.toLowerCase().includes(cleanSearch) || i.repo.toLowerCase().includes(cleanSearch));
        }
      }
      return issues;
    }
  }

  async getGithubSyncMetadata() {
    try {
      await this.ensureInitialized();
      const result = await this.pool.query(`
        SELECT COUNT(*)::int AS total, MAX(synced_at) AS last_synced_at FROM github_issues
      `);
      return result.rows[0] || { total: 0, last_synced_at: null };
    } catch (err) {
      warn("PostgreSQL getGithubSyncMetadata failed, using in-memory fallback", { err: err.message });
      if (!this.inMemoryGithubIssues) return { total: 0, last_synced_at: null };
      const issues = Array.from(this.inMemoryGithubIssues.values());
      const maxSync = issues.reduce((max, i) => (i.synced_at > max ? i.synced_at : max), null);
      return { total: issues.length, last_synced_at: maxSync };
    }
  }

  async upsertPdfChunks(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return 0;
    const filename = chunks[0]?.filename || 'doc.pdf';
    const textContent = chunks.map((c) => c.content).join('\n\n');
    const res = await pythonAIServiceClient.processRAGIngestion(textContent, filename);
    return res?.chunks?.length || chunks.length;
  }

  async hybridSearchPdfChunks({ query, embedding = null, topK = 20, metadataFilter = null } = {}) {
    const filterFilename = metadataFilter?.filename || '';
    const results = await pythonAIServiceClient.searchRAG(query, topK, filterFilename);
    return results.map((r) => ({
      id: r.metadata.id,
      documentId: r.metadata.filename,
      filename: r.metadata.filename,
      chunkIndex: r.metadata.chunkIndex,
      content: r.pageContent,
      parentContent: r.metadata.parentContent,
      score: r.metadata.score,
    }));
  }

  async getPdfChunksByFilename(filename, topK = 100) {
    const results = await pythonAIServiceClient.getDocumentChunks(filename);
    if (results && results.length > 0) {
      return results.map((r) => ({
        id: r.metadata.id,
        documentId: r.metadata.filename,
        filename: r.metadata.filename,
        chunkIndex: r.metadata.chunkIndex,
        content: r.pageContent,
        parentContent: r.metadata.parentContent,
        score: r.metadata.score,
      }));
    }
    return this.hybridSearchPdfChunks({ query: '', topK, metadataFilter: { filename } });
  }

  async deletePdfDocument(filename) {
    const res = await pythonAIServiceClient.deleteDocument(filename);
    return res?.deleted_chunks || 0;
  }

  async listPdfDocuments() {
    const docs = await pythonAIServiceClient.listDocuments();
    return docs.map((d) => ({
      id: d.filename,
      filename: d.filename,
      chunkCount: d.total_chunks,
      lastUpdated: d.created_at,
    }));
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

  async saveDoraSnapshot(data) {
    await this.ensureInitialized().catch(() => {});
    const record = {
      id: this.inMemoryDoraSnapshots.length + 1,
      team_id: data.team_id || 'default',
      deployment_frequency: data.deployment_frequency || 0,
      lead_time_hours: data.lead_time_hours || 0,
      change_failure_rate: data.change_failure_rate || 0,
      mttr_hours: data.mttr_hours || 0,
      period_start: data.period_start || new Date(),
      period_end: data.period_end || new Date(),
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemoryDoraSnapshots.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO dora_snapshots (team_id, deployment_frequency, lead_time_hours, change_failure_rate, mttr_hours, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [record.team_id, record.deployment_frequency, record.lead_time_hours, record.change_failure_rate, record.mttr_hours, record.period_start, record.period_end]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveDoraSnapshot failed, using in-memory fallback', { err: err.message });
      this.inMemoryDoraSnapshots.push(record);
      return record;
    }
  }

  async getDoraSnapshots(teamId = null) {
    await this.ensureInitialized().catch(() => {});
    if (!this.pool) {
      return teamId ? this.inMemoryDoraSnapshots.filter(r => r.team_id === teamId) : this.inMemoryDoraSnapshots;
    }
    try {
      const queryText = teamId ? `SELECT * FROM dora_snapshots WHERE team_id = $1 ORDER BY created_at DESC` : `SELECT * FROM dora_snapshots ORDER BY created_at DESC`;
      const params = teamId ? [teamId] : [];
      const res = await this.pool.query(queryText, params);
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getDoraSnapshots failed, using in-memory fallback', { err: err.message });
      return teamId ? this.inMemoryDoraSnapshots.filter(r => r.team_id === teamId) : this.inMemoryDoraSnapshots;
    }
  }

  async saveSbiRecord(data) {
    await this.ensureInitialized().catch(() => {});
    const record = {
      id: this.inMemorySbiRecords.length + 1,
      engineer_id: data.engineer_id || 'unknown',
      situation: data.situation || '',
      behavior: data.behavior || '',
      impact: data.impact || '',
      action_plan: data.action_plan || '',
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemorySbiRecords.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO sbi_feedback_records (engineer_id, situation, behavior, impact, action_plan)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [record.engineer_id, record.situation, record.behavior, record.impact, record.action_plan]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveSbiRecord failed, using in-memory fallback', { err: err.message });
      this.inMemorySbiRecords.push(record);
      return record;
    }
  }

  async getSbiRecords(engineerId = null) {
    await this.ensureInitialized().catch(() => {});
    if (!this.pool) {
      return engineerId ? this.inMemorySbiRecords.filter(r => r.engineer_id === engineerId) : this.inMemorySbiRecords;
    }
    try {
      const queryText = engineerId ? `SELECT * FROM sbi_feedback_records WHERE engineer_id = $1 ORDER BY created_at DESC` : `SELECT * FROM sbi_feedback_records ORDER BY created_at DESC`;
      const params = engineerId ? [engineerId] : [];
      const res = await this.pool.query(queryText, params);
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getSbiRecords failed, using in-memory fallback', { err: err.message });
      return engineerId ? this.inMemorySbiRecords.filter(r => r.engineer_id === engineerId) : this.inMemorySbiRecords;
    }
  }

  async saveSprintAnalytics(data) {
    await this.ensureInitialized().catch(() => {});
    const record = {
      id: this.inMemorySprintAnalytics.length + 1,
      sprint_id: data.sprint_id || `sprint_${Date.now()}`,
      total_points: data.total_points || 0,
      completed_points: data.completed_points || 0,
      wip_violations: data.wip_violations || 0,
      retro_action_items: data.retro_action_items || [],
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemorySprintAnalytics.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO sprint_analytics (sprint_id, total_points, completed_points, wip_violations, retro_action_items)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (sprint_id) DO UPDATE SET total_points = EXCLUDED.total_points, completed_points = EXCLUDED.completed_points, wip_violations = EXCLUDED.wip_violations, retro_action_items = EXCLUDED.retro_action_items
         RETURNING *`,
        [record.sprint_id, record.total_points, record.completed_points, record.wip_violations, JSON.stringify(record.retro_action_items)]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveSprintAnalytics failed, using in-memory fallback', { err: err.message });
      this.inMemorySprintAnalytics.push(record);
      return record;
    }
  }

  async getSprintAnalytics(sprintId = null) {
    await this.ensureInitialized().catch(() => {});
    if (!this.pool) {
      return sprintId ? this.inMemorySprintAnalytics.filter(r => r.sprint_id === sprintId) : this.inMemorySprintAnalytics;
    }
    try {
      const queryText = sprintId ? `SELECT * FROM sprint_analytics WHERE sprint_id = $1` : `SELECT * FROM sprint_analytics ORDER BY created_at DESC`;
      const params = sprintId ? [sprintId] : [];
      const res = await this.pool.query(queryText, params);
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getSprintAnalytics failed, using in-memory fallback', { err: err.message });
      return sprintId ? this.inMemorySprintAnalytics.filter(r => r.sprint_id === sprintId) : this.inMemorySprintAnalytics;
    }
  }

  async saveOkrRecord(data) {
    await this.ensureInitialized().catch(() => {});
    const record = {
      id: this.inMemoryOkrTracker.length + 1,
      objective: data.objective || '',
      key_result: data.key_result || '',
      target_value: data.target_value || 100,
      current_value: data.current_value || 0,
      status: data.status || 'ON_TRACK',
      quarter: data.quarter || 'Q1',
      created_at: new Date(),
    };
    if (!this.pool) {
      this.inMemoryOkrTracker.push(record);
      return record;
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO okr_tracker (objective, key_result, target_value, current_value, status, quarter)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [record.objective, record.key_result, record.target_value, record.current_value, record.status, record.quarter]
      );
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL saveOkrRecord failed, using in-memory fallback', { err: err.message });
      this.inMemoryOkrTracker.push(record);
      return record;
    }
  }

  async getOkrRecords(quarter = null) {
    await this.ensureInitialized().catch(() => {});
    if (!this.pool) {
      return quarter ? this.inMemoryOkrTracker.filter(r => r.quarter === quarter) : this.inMemoryOkrTracker;
    }
    try {
      const queryText = quarter ? `SELECT * FROM okr_tracker WHERE quarter = $1 ORDER BY created_at DESC` : `SELECT * FROM okr_tracker ORDER BY created_at DESC`;
      const params = quarter ? [quarter] : [];
      const res = await this.pool.query(queryText, params);
      return res.rows;
    } catch (err) {
      warn('PostgreSQL getOkrRecords failed, using in-memory fallback', { err: err.message });
      return quarter ? this.inMemoryOkrTracker.filter(r => r.quarter === quarter) : this.inMemoryOkrTracker;
    }
  }

  async getOkrsByQuarter(quarter = null) {
    return this.getOkrRecords(quarter);
  }

  async getAppSetting(key, defaultValue = null) {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query(
        'SELECT key, value, source, updated_at FROM app_settings WHERE key = $1',
        [key]
      );
      if (res.rows.length > 0) {
        return {
          key: res.rows[0].key,
          value: res.rows[0].value,
          source: res.rows[0].source,
          updated_at: res.rows[0].updated_at,
        };
      }
      return defaultValue != null ? { key, value: defaultValue, source: 'default' } : null;
    } catch (err) {
      warn('PostgreSQL getAppSetting failed, using in-memory fallback', { key, err: err.message });
      const inMem = this.inMemoryAppSettings[key];
      return inMem || (defaultValue != null ? { key, value: defaultValue, source: 'default' } : null);
    }
  }

  async setAppSetting(key, value, source = 'database') {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query(
        `
        INSERT INTO app_settings (key, value, source, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = $2, source = $3, updated_at = NOW()
        RETURNING key, value, source, updated_at
        `,
        [key, JSON.stringify(value), source]
      );
      this.inMemoryAppSettings[key] = res.rows[0];
      return res.rows[0];
    } catch (err) {
      warn('PostgreSQL setAppSetting failed, storing in-memory', { key, err: err.message });
      const record = { key, value, source, updated_at: new Date().toISOString() };
      this.inMemoryAppSettings[key] = record;
      return record;
    }
  }

  async getAllAppSettings() {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query('SELECT key, value, source, updated_at FROM app_settings ORDER BY key ASC');
      const settingsMap = {};
      for (const row of res.rows) {
        settingsMap[row.key] = {
          value: row.value,
          source: row.source,
          updated_at: row.updated_at,
        };
      }
      return settingsMap;
    } catch (err) {
      warn('PostgreSQL getAllAppSettings failed, using in-memory fallback', { err: err.message });
      const settingsMap = {};
      for (const [k, v] of Object.entries(this.inMemoryAppSettings)) {
        settingsMap[k] = {
          value: v.value,
          source: v.source,
          updated_at: v.updated_at,
        };
      }
      return settingsMap;
    }
  }

  async deleteAppSetting(key) {
    try {
      await this.ensureInitialized();
      await this.pool.query('DELETE FROM app_settings WHERE key = $1', [key]);
      delete this.inMemoryAppSettings[key];
      return true;
    } catch (err) {
      delete this.inMemoryAppSettings[key];
      return true;
    }
  }

  async getTeamMembers() {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query('SELECT * FROM team_members ORDER BY display_name ASC');
      return res.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        aliases: typeof row.aliases === 'string' ? safeJsonParse(row.aliases) : row.aliases || [],
        githubUsername: row.github_username,
        jiraEmail: row.jira_email,
        jiraAccountId: row.jira_account_id,
        gcalEmail: row.gcal_email,
        notionName: row.notion_name,
        currentLevel: row.current_level,
        targetLevel: row.target_level,
        track: row.track,
        tenureMonths: row.tenure_months,
        skills: typeof row.skills === 'string' ? safeJsonParse(row.skills) : row.skills || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      warn('PostgreSQL getTeamMembers failed, using in-memory fallback', { err: err.message });
      return [...this.inMemoryTeamMembers];
    }
  }

  async getTeamMemberById(id) {
    try {
      await this.ensureInitialized();
      const res = await this.pool.query('SELECT * FROM team_members WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        aliases: typeof row.aliases === 'string' ? safeJsonParse(row.aliases) : row.aliases || [],
        githubUsername: row.github_username,
        jiraEmail: row.jira_email,
        jiraAccountId: row.jira_account_id,
        gcalEmail: row.gcal_email,
        notionName: row.notion_name,
        currentLevel: row.current_level,
        targetLevel: row.target_level,
        track: row.track,
        tenureMonths: row.tenure_months,
        skills: typeof row.skills === 'string' ? safeJsonParse(row.skills) : row.skills || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      return this.inMemoryTeamMembers.find((m) => m.id === id) || null;
    }
  }

  async upsertTeamMember(memberData) {
    const id = memberData.id || createOpaqueId('mem');
    const displayName = memberData.displayName || memberData.display_name || 'Team Member';
    const email = memberData.email || `${id}@company.internal`;
    const aliases = JSON.stringify(memberData.aliases || [displayName]);
    const githubUsername = memberData.githubUsername || memberData.github_username || null;
    const jiraEmail = memberData.jiraEmail || memberData.jira_email || email;
    const jiraAccountId = memberData.jiraAccountId || memberData.jira_account_id || null;
    const gcalEmail = memberData.gcalEmail || memberData.gcal_email || email;
    const notionName = memberData.notionName || memberData.notion_name || displayName;
    const currentLevel = memberData.currentLevel || memberData.current_level || 'L4_MID';
    const targetLevel = memberData.targetLevel || memberData.target_level || 'L5_SENIOR';
    const track = memberData.track || 'INDIVIDUAL_CONTRIBUTOR';
    const tenureMonths = Number(memberData.tenureMonths || memberData.tenure_months || 12);
    const skills = JSON.stringify(memberData.skills || {});

    try {
      await this.ensureInitialized();
      const res = await this.pool.query(
        `
        INSERT INTO team_members (
          id, display_name, email, aliases, github_username, jira_email,
          jira_account_id, gcal_email, notion_name, current_level, target_level,
          track, tenure_months, skills, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          aliases = EXCLUDED.aliases,
          github_username = COALESCE(EXCLUDED.github_username, team_members.github_username),
          jira_email = COALESCE(EXCLUDED.jira_email, team_members.jira_email),
          jira_account_id = COALESCE(EXCLUDED.jira_account_id, team_members.jira_account_id),
          gcal_email = COALESCE(EXCLUDED.gcal_email, team_members.gcal_email),
          notion_name = COALESCE(EXCLUDED.notion_name, team_members.notion_name),
          current_level = EXCLUDED.current_level,
          target_level = EXCLUDED.target_level,
          track = EXCLUDED.track,
          tenure_months = EXCLUDED.tenure_months,
          skills = EXCLUDED.skills,
          updated_at = NOW()
        RETURNING *;
        `,
        [
          id, displayName, email, aliases, githubUsername, jiraEmail,
          jiraAccountId, gcalEmail, notionName, currentLevel, targetLevel,
          track, tenureMonths, skills
        ]
      );
      const row = res.rows[0];
      const member = {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        aliases: typeof row.aliases === 'string' ? safeJsonParse(row.aliases) : row.aliases || [],
        githubUsername: row.github_username,
        jiraEmail: row.jira_email,
        jiraAccountId: row.jira_account_id,
        gcalEmail: row.gcal_email,
        notionName: row.notion_name,
        currentLevel: row.current_level,
        targetLevel: row.target_level,
        track: row.track,
        tenureMonths: row.tenure_months,
        skills: typeof row.skills === 'string' ? safeJsonParse(row.skills) : row.skills || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      // Keep in-memory in sync
      const idx = this.inMemoryTeamMembers.findIndex((m) => m.id === id);
      if (idx >= 0) this.inMemoryTeamMembers[idx] = member;
      else this.inMemoryTeamMembers.push(member);
      return member;
    } catch (err) {
      warn('PostgreSQL upsertTeamMember failed, saving to in-memory fallback', { err: err.message });
      const member = {
        id, displayName, email, aliases: safeJsonParse(aliases),
        githubUsername, jiraEmail, jiraAccountId, gcalEmail,
        notionName, currentLevel, targetLevel, track,
        tenureMonths, skills: safeJsonParse(skills),
        updatedAt: new Date().toISOString(),
      };
      const idx = this.inMemoryTeamMembers.findIndex((m) => m.id === id);
      if (idx >= 0) this.inMemoryTeamMembers[idx] = member;
      else this.inMemoryTeamMembers.push(member);
      return member;
    }
  }

  async deleteTeamMember(id) {
    try {
      await this.ensureInitialized();
      await this.pool.query('DELETE FROM team_members WHERE id = $1', [id]);
      this.inMemoryTeamMembers = this.inMemoryTeamMembers.filter((m) => m.id !== id);
      return true;
    } catch (err) {
      this.inMemoryTeamMembers = this.inMemoryTeamMembers.filter((m) => m.id !== id);
      return true;
    }
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

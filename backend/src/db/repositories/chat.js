/**
 * Sessions, chat threads and messages.
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */
import { warn } from '../../utils/logger.js';
import { safeJsonParse, createOpaqueId, normalizeSessionRow } from '../rowMappers.js';

// In-memory stores used only when no pool exists (tests that pre-seed state).
const inMemorySessions = new Map();
const inMemoryThreads = new Map();

export class ChatRepository {
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

  async getThreadContextMatrix(threadId) {
    await this.ensureInitialized();
    if (!threadId) return null;
    if (!this.pool) {
      const existing = inMemoryThreads.get(threadId);
      return existing?.context_matrix || null;
    }
    try {
      const res = await this.pool.query(
        'SELECT context_matrix FROM chat_threads WHERE id = $1 LIMIT 1',
        [threadId],
      );
      if (res.rowCount > 0 && res.rows[0].context_matrix) {
        return typeof res.rows[0].context_matrix === 'string'
          ? JSON.parse(res.rows[0].context_matrix)
          : res.rows[0].context_matrix;
      }
      return null;
    } catch (err) {
      warn('Failed to getThreadContextMatrix from PostgreSQL', { threadId, err: err?.message });
      const existing = inMemoryThreads.get(threadId);
      return existing?.context_matrix || null;
    }
  }

  async updateThreadContextMatrix(threadId, contextMatrix = {}) {
    await this.ensureInitialized();
    if (!threadId) return null;
    const matrixPayload = typeof contextMatrix === 'object' && contextMatrix !== null ? contextMatrix : {};
    const inMem = inMemoryThreads.get(threadId);
    if (inMem) {
      inMem.context_matrix = matrixPayload;
      inMem.updated_at = new Date().toISOString();
    }
    if (!this.pool) {
      return matrixPayload;
    }
    try {
      await this.pool.query(
        `
          UPDATE chat_threads
          SET context_matrix = $2::jsonb, updated_at = NOW()
          WHERE id = $1
        `,
        [threadId, JSON.stringify(matrixPayload)],
      );
      return matrixPayload;
    } catch (err) {
      warn('Failed to updateThreadContextMatrix in PostgreSQL', { threadId, err: err?.message });
      return matrixPayload;
    }
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

  /** Insert one chat message with `q` (the pool or a transaction client) and bump the thread. */
  async insertMessageWith(q, {
    threadId,
    role,
    content,
    strategy = null,
    executorPath = null,
    traceId = null,
    citations = null,
    metadata = null,
  }) {
    if (!threadId) {
      throw new Error('threadId is required to save message');
    }
    const normalizedMetadata =
      metadata == null ? null : typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    const normalizedCitations =
      citations == null ? null : typeof citations === 'string' ? citations : JSON.stringify(citations);

    const result = await q.query(
      `
        INSERT INTO chat_messages (thread_id, role, content, strategy, executor_path, trace_id, citations_json, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [threadId, role, content, strategy, executorPath, traceId, normalizedCitations, normalizedMetadata],
    );

    await q.query(
      `
        UPDATE chat_threads
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [threadId],
    );

    return { id: result.rows[0].id };
  }

  async saveMessage(input) {
    await this.ensureInitialized();
    return this.insertMessageWith(this.pool, input || {});
  }

  /**
   * Save a user message and its assistant reply atomically: either both rows exist or neither.
   * `assistant(userMessageId)` may be an object or a function of the saved user message id.
   */
  async saveMessagePair(user, assistant) {
    return this.withTransaction(async (client) => {
      const userRecord = await this.insertMessageWith(client, user);
      const assistantInput = typeof assistant === 'function' ? assistant(userRecord.id) : assistant;
      const assistantRecord = await this.insertMessageWith(client, assistantInput);
      return { user: userRecord, assistant: assistantRecord };
    });
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
}

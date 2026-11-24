/**
 * Legacy tables (chat_history, task_cache, user_preferences). Do not add new consumers.
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */

export class LegacyRepository {
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
}

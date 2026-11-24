/**
 * app_settings (LLM and integration settings).
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */
import { warn } from '../../utils/logger.js';

export class SettingsRepository {
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

  /**
   * Write several settings in one transaction (e.g. the llm + mcp pair), so a failure never leaves
   * one half saved. Throws on failure: unlike setAppSetting there is no in-memory fallback,
   * because the caller is an owner action that must not report "saved" when it was not.
   * @param {Array<{key:string, value:any, source?:string}>} entries
   */
  async setAppSettings(entries) {
    const rows = await this.withTransaction(async (client) => {
      const saved = [];
      for (const { key, value, source = 'database' } of entries) {
        const res = await client.query(
          `
          INSERT INTO app_settings (key, value, source, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = $2, source = $3, updated_at = NOW()
          RETURNING key, value, source, updated_at
          `,
          [key, JSON.stringify(value), source],
        );
        saved.push(res.rows[0]);
      }
      return saved;
    });
    for (const row of rows) this.inMemoryAppSettings[row.key] = row;
    return Object.fromEntries(rows.map((r) => [r.key, r]));
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
}

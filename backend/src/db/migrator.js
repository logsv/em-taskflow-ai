/**
 * Numbered SQL migrations.
 *
 * Files in src/db/migrations named NNN_description.sql run once, in order, each in its own
 * transaction, and are recorded in schema_migrations with a checksum. A pg advisory lock
 * keeps two processes (API + worker) from migrating at the same time.
 *
 * An applied migration whose file has changed is an error: fix forward with a new file.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { info } from '../utils/logger.js';
import { swallow } from '../core/safe.js';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_KEY = 74_726_501; // arbitrary, stable per application
const FILE_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

export function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

/** Read and order migration files. Throws on duplicate or malformed names. */
export function loadMigrations(dir = MIGRATIONS_DIR) {
  const seen = new Set();
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((file) => {
      const m = FILE_PATTERN.exec(file);
      if (!m) throw new Error(`Migration file name must look like 001_name.sql: ${file}`);
      const version = Number(m[1]);
      if (seen.has(version)) throw new Error(`Duplicate migration version ${version}`);
      seen.add(version);
      const sql = readFileSync(join(dir, file), 'utf8');
      return { version, name: m[2], file, sql, checksum: checksum(sql) };
    })
    .sort((a, b) => a.version - b.version);
}

/**
 * Apply pending migrations.
 * @param {import('pg').Pool} pool
 * @param {{ migrations?: ReturnType<typeof loadMigrations> }} [opts]
 * @returns {Promise<{ applied: number[], current: number }>}
 */
export async function runMigrations(pool, { migrations = loadMigrations() } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    const done = new Map(rows.map((r) => [Number(r.version), r.checksum]));

    const applied = [];
    for (const mig of migrations) {
      if (done.has(mig.version)) {
        if (done.get(mig.version) !== mig.checksum) {
          throw new Error(`Migration ${mig.file} was changed after it was applied. Add a new migration instead.`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(mig.sql);
        await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [mig.version, mig.name, mig.checksum]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${mig.file} failed: ${err.message}`, { cause: err });
      }
      applied.push(mig.version);
      info({ module: 'migrator', version: mig.version, name: mig.name }, `Applied migration ${mig.file}`);
    }
    const current = migrations.length ? migrations[migrations.length - 1].version : 0;
    return { applied, current };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(swallow('db.migrator.unlock'));
    client.release();
  }
}

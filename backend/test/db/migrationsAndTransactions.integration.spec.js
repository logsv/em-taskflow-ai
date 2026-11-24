/**
 * Runs against a real PostgreSQL when TEST_DATABASE_URL is set (CI sets it; locally:
 * TEST_DATABASE_URL=postgres://user@localhost:5432/taskflow_test npm test). Each run starts
 * from an empty schema. Skipped, not passed, when no database is configured.
 */
import pg from 'pg';
import db from '../../src/db/postgres.js';
import { runMigrations, loadMigrations } from '../../src/db/migrator.js';

const baseUrl = process.env.TEST_DATABASE_URL;
let url = null;

/** Use a dedicated <db>_it database so dropping its schema never touches the suite's test DB. */
async function ensureIsolatedDatabase() {
  const parsed = new URL(baseUrl);
  const name = `${parsed.pathname.replace(/^\//, '') || 'taskflow'}_it`.replace(/[^a-zA-Z0-9_]/g, '_');
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function resetSchema(pool) {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

describe('PostgreSQL migrations and transactions (integration)', () => {
  let pool;

  beforeAll(async () => {
    if (!baseUrl) return;
    url = await ensureIsolatedDatabase();
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await resetSchema(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    db.pool = null;
    db.initialized = false;
  });

  beforeEach(function () {
    if (!baseUrl) pending('TEST_DATABASE_URL not set');
  });

  const useDb = () => {
    db.pool = pool;
    db.initialized = true;
    db.initializing = null;
  };

  it('applies every migration on an empty database and is a no-op the second time', async () => {
    const first = await runMigrations(pool);
    expect(first.applied).toEqual(loadMigrations().map((m) => m.version));
    const second = await runMigrations(pool);
    expect(second.applied).toEqual([]);
    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual(first.applied);
  });

  it('refuses to run when an applied migration file was edited', async () => {
    const edited = loadMigrations().map((m) => (m.version === 1 ? { ...m, checksum: 'changed' } : m));
    await expectAsync(runMigrations(pool, { migrations: edited })).toBeRejectedWithError(/was changed after it was applied/);
  });

  it('rolls back a failing migration and records nothing for it', async () => {
    const bad = [...loadMigrations(), { version: 999, name: 'broken', file: '999_broken.sql', sql: 'CREATE TABLE half_done (id INT); SELECT * FROM no_such_table;', checksum: 'x' }];
    await expectAsync(runMigrations(pool, { migrations: bad })).toBeRejectedWithError(/999_broken.sql failed/);
    const t = await pool.query("SELECT to_regclass('public.half_done') AS t");
    expect(t.rows[0].t).toBeNull();
    const v = await pool.query('SELECT 1 FROM schema_migrations WHERE version = 999');
    expect(v.rowCount).toBe(0);
  });

  it('adopts a database created by the pre-migration createTables()', async () => {
    const legacy = new pg.Pool({ connectionString: url, max: 1 });
    try {
      await resetSchema(legacy);
      // The old code ran the same idempotent DDL without schema_migrations.
      await legacy.query(loadMigrations()[0].sql);
      await legacy.query("INSERT INTO team_members (id, display_name) VALUES ('mem_old', 'Old Member')");
      const res = await runMigrations(legacy);
      expect(res.applied).toEqual(loadMigrations().map((m) => m.version));
      const row = await legacy.query("SELECT current_level FROM team_members WHERE id = 'mem_old'");
      expect(row.rows[0].current_level).toBe('L4_MID'); // existing data is not rewritten
    } finally {
      await legacy.end();
    }
  });

  it('new roster members have no assumed level or tenure, and a re-sync keeps entered values', async () => {
    useDb();
    const fresh = await db.upsertTeamMember({ id: 'mem_new', displayName: 'New Person' });
    expect(fresh.currentLevel).toBeNull();
    expect(fresh.targetLevel).toBeNull();
    expect(fresh.tenureMonths).toBeNull();

    await db.upsertTeamMember({ id: 'mem_new', displayName: 'New Person', currentLevel: 'L5_SENIOR', targetLevel: 'L6_STAFF', tenureMonths: 30 });
    const resynced = await db.upsertTeamMember({ id: 'mem_new', displayName: 'New Person', githubUsername: 'np' });
    expect(resynced.currentLevel).toBe('L5_SENIOR');
    expect(resynced.targetLevel).toBe('L6_STAFF');
    expect(resynced.tenureMonths).toBe(30);
    expect(resynced.githubUsername).toBe('np');

    // Two members without email no longer collide on the UNIQUE email column.
    await db.upsertTeamMember({ id: 'mem_a', displayName: 'A' });
    const b = await db.upsertTeamMember({ id: 'mem_b', displayName: 'B' });
    expect(b.email).toBeNull();
  });

  it('saves a user/assistant message pair atomically', async () => {
    useDb();
    await pool.query("INSERT INTO chat_threads (id, title) VALUES ('th_pair', 'Pair')");
    const pair = await db.saveMessagePair(
      { threadId: 'th_pair', role: 'user', content: 'q' },
      (userId) => ({ threadId: 'th_pair', role: 'assistant', content: 'a', metadata: { userMessageId: userId } }),
    );
    expect(Number(pair.assistant.id)).toBeGreaterThan(Number(pair.user.id));

    // An invalid assistant row (role fails the CHECK constraint) must roll back the user row too.
    await expectAsync(db.saveMessagePair(
      { threadId: 'th_pair', role: 'user', content: 'orphan?' },
      { threadId: 'th_pair', role: 'robot', content: 'x' },
    )).toBeRejected();
    const { rows } = await pool.query("SELECT content FROM chat_messages WHERE thread_id = 'th_pair' ORDER BY id");
    expect(rows.map((r) => r.content)).toEqual(['q', 'a']);
  });

  it('records an audit run and its action items in one transaction', async () => {
    useDb();
    const ok = await db.recordAuditRun({ triggeredBy: 'TEST', healthScore: 80 }, [
      { id: 'act_t1', title: 'One', category: 'DELIVERY', severity: 'WARNING' },
    ]);
    expect(ok.actionItems[0].auditRunId).toBe(ok.auditRun.id);

    const before = await pool.query('SELECT COUNT(*)::int AS n FROM em_audit_runs');
    await expectAsync(db.recordAuditRun({ triggeredBy: 'TEST' }, [
      { id: 'act_t2', title: 'Two', category: 'X'.repeat(100), severity: 'WARNING' }, // category is VARCHAR(32)
    ])).toBeRejected();
    const after = await pool.query('SELECT COUNT(*)::int AS n FROM em_audit_runs');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('writes the llm/mcp settings pair atomically', async () => {
    useDb();
    const saved = await db.setAppSettings([{ key: 'llm', value: { a: 1 } }, { key: 'mcp', value: { b: 2 } }]);
    expect(saved.llm.value).toEqual({ a: 1 });
    await expectAsync(db.setAppSettings([{ key: 'llm', value: { a: 2 } }, { key: null, value: {} }])).toBeRejected();
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'llm'");
    expect(rows[0].value).toEqual({ a: 1 });
  });

  it('runs the action item lifecycle: owner, due date, dismiss with reason, snooze and wake', async () => {
    useDb();
    await db.recordAuditRun({ triggeredBy: 'TEST' }, [
      { id: 'act_life_1', title: 'Stalled PR', category: 'DELIVERY', severity: 'WARNING' },
      { id: 'act_life_2', title: 'Overdue 1-on-1', category: 'PEOPLE', severity: 'WARNING' },
    ]);
    const owned = await db.updateActionItem('act_life_1', { assigneeName: 'Priya', dueDate: '2026-12-05' });
    expect(owned).toEqual(jasmine.objectContaining({ assigneeName: 'Priya', dueDate: '2026-12-05', status: 'PENDING' }));

    const dismissed = await db.updateActionItem('act_life_1', { status: 'DISMISSED', dismissedReason: 'Owned by platform team' });
    expect(dismissed.dismissedReason).toBe('Owned by platform team');

    // A re-run of the audit must not reopen a dismissed item.
    await db.recordAuditRun({ triggeredBy: 'TEST' }, [{ id: 'act_life_1', title: 'Stalled PR', category: 'DELIVERY', severity: 'WARNING' }]);
    expect((await db.getActionItemsByIds(['act_life_1']))[0].status).toBe('DISMISSED');

    await db.updateActionItem('act_life_2', { status: 'SNOOZED', snoozedUntil: new Date(Date.now() + 60_000) });
    expect(await db.wakeSnoozedActionItems()).toBe(0);
    await pool.query("UPDATE em_action_items SET snoozed_until = NOW() - INTERVAL '1 minute' WHERE id = 'act_life_2'");
    const listed = await db.listActionItems({ status: 'PENDING' });
    expect(listed.items ? listed.items.map((i) => i.id) : listed.map((i) => i.id)).toContain('act_life_2');
  });

  it('batch-upserts GitHub issues and reports rows actually written', async () => {
    useDb();
    const issues = Array.from({ length: 50 }, (_, i) => ({ number: i + 1, repo: 'o/r', title: `Issue ${i + 1}`, labels: ['bug'] }));
    expect(await db.upsertGithubIssues(issues)).toBe(50);
    expect(await db.upsertGithubIssues([{ number: 1, repo: 'o/r', title: 'Renamed', state: 'closed' }])).toBe(1);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n, MAX(title) FILTER (WHERE issue_number = 1) AS t FROM github_issues");
    expect(rows[0]).toEqual({ n: 50, t: 'Renamed' });
  });
});

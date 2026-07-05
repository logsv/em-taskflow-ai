import sinon from 'sinon';
import db from '../../src/db/postgres.js';

describe('DatabaseService session foundation', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    db.initialized = true;
    db.initializing = null;
  });

  afterEach(() => {
    sandbox.restore();
    db.pool = null;
    db.initialized = false;
    db.initializing = null;
  });

  it('creates session and feedback tables plus session/message columns', async () => {
    const executedSql = [];
    db.pool = {
      query: sandbox.stub().callsFake(async (sql) => {
        executedSql.push(sql);
        return { rowCount: 0, rows: [] };
      }),
    };

    await db.createTables();

    const combined = executedSql.join('\n');
    expect(combined).toContain('CREATE TABLE IF NOT EXISTS sessions');
    expect(combined).toContain('CREATE TABLE IF NOT EXISTS feedback');
    expect(combined).toContain('ADD COLUMN IF NOT EXISTS session_id');
    expect(combined).toContain('ADD COLUMN IF NOT EXISTS trace_id');
    expect(combined).toContain('ADD COLUMN IF NOT EXISTS citations_json');
  });

  it('creates a session and parses client info', async () => {
    db.pool = {
      query: sandbox.stub().resolves({ rowCount: 1, rows: [] }),
    };

    const session = await db.createSession({ userAgent: 'test-agent' });

    expect(session.id).toMatch(/^sess_/);
    expect(session.active_thread_id).toBeNull();
    expect(session.client_info).toEqual({ userAgent: 'test-agent' });
    expect(db.pool.query.firstCall.args[0]).toContain('INSERT INTO sessions');
  });

  it('creates an active thread for a session', async () => {
    const queryStub = sandbox.stub();
    queryStub.onFirstCall().resolves({ rowCount: 0, rows: [] });
    queryStub.onSecondCall().resolves({ rowCount: 1, rows: [] });
    queryStub.onThirdCall().resolves({ rowCount: 1, rows: [] });

    db.pool = { query: queryStub };

    const thread = await db.createThreadForSession('sess_123', 'Planning');

    expect(thread.id).toMatch(/^th_/);
    expect(thread.session_id).toBe('sess_123');
    expect(queryStub.firstCall.args[0]).toContain('INSERT INTO chat_threads');
    expect(queryStub.secondCall.args[0]).toContain('UPDATE sessions');
  });

  it('returns the session active thread when present', async () => {
    const queryStub = sandbox.stub();
    queryStub.onFirstCall().resolves({
      rowCount: 1,
      rows: [
        {
          id: 'sess_123',
          active_thread_id: 'th_123',
          client_info: '{"source":"cookie"}',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    queryStub.onSecondCall().resolves({ rowCount: 1, rows: [] });
    queryStub.onThirdCall().resolves({
      rowCount: 1,
      rows: [{ id: 'th_123', session_id: 'sess_123', title: 'Existing Thread' }],
    });
    queryStub.onCall(3).resolves({ rowCount: 1, rows: [] });
    queryStub.onCall(4).resolves({ rowCount: 1, rows: [] });

    db.pool = { query: queryStub };

    const thread = await db.getOrCreateActiveThread('sess_123', 'Fallback');

    expect(thread.id).toBe('th_123');
    expect(thread.session_id).toBe('sess_123');
  });

  it('stores trace ids and citations with messages', async () => {
    const queryStub = sandbox.stub();
    queryStub.onFirstCall().resolves({ rows: [{ id: 42 }] });
    queryStub.onSecondCall().resolves({ rowCount: 1, rows: [] });

    db.pool = { query: queryStub };

    const result = await db.saveMessage({
      threadId: 'th_123',
      role: 'assistant',
      content: 'Hello',
      traceId: 'trace_123',
      citations: [{ filename: 'spec.pdf', chunkIndex: 0 }],
      metadata: { source: 'github' },
    });

    expect(result.id).toBe(42);
    expect(queryStub.firstCall.args[0]).toContain('trace_id');
    expect(queryStub.firstCall.args[0]).toContain('citations_json');
    expect(queryStub.firstCall.args[1][5]).toBe('trace_123');
  });

  it('creates feedback records linked to session, thread, message, and trace', async () => {
    const queryStub = sandbox.stub().resolves({ rowCount: 1, rows: [] });
    db.pool = { query: queryStub };

    const feedback = await db.createFeedback({
      sessionId: 'sess_123',
      threadId: 'th_123',
      messageId: 99,
      traceId: 'trace_123',
      score: 'thumbs_up',
      comment: 'Helpful',
      metadata: { source: 'ui' },
    });

    expect(feedback.id).toMatch(/^fb_/);
    expect(feedback.traceId).toBe('trace_123');
    expect(feedback.metadata).toEqual({ source: 'ui' });
    expect(queryStub.firstCall.args[0]).toContain('INSERT INTO feedback');
  });
});

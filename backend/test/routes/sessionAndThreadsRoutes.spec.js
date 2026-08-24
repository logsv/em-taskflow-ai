import express from 'express';
import supertest from 'supertest';
import apiRouter from '../../src/routes/api.js';
import databaseService from '../../src/db/postgres.js';

describe('Session and Threads Endpoints Contract', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', apiRouter);

    spyOn(databaseService, 'getSession').and.resolveTo({
      id: 'sess_test',
      active_thread_id: 'th_active',
      created_at: new Date(),
    });
    spyOn(databaseService, 'createSession').and.resolveTo({
      id: 'sess_test',
      active_thread_id: 'th_active',
    });
    spyOn(databaseService, 'touchSession').and.resolveTo();
    spyOn(databaseService, 'getOrCreateActiveThread').and.resolveTo({
      id: 'th_active',
      session_id: 'sess_test',
      title: 'Active Thread',
    });
  });

  it('GET /api/session returns session, thread, and messages list', async () => {
    spyOn(databaseService, 'getThreadMessages').and.resolveTo([
      { id: 1, role: 'user', content: 'Hello' },
      { id: 2, role: 'assistant', content: 'Hi there' },
    ]);

    const res = await supertest(app)
      .get('/api/session')
      .set('x-session-id', 'sess_test');

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('sess_test');
    expect(res.body.threadId).toBe('th_active');
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBe(2);
  });

  it('POST /api/threads creates a new chat thread for active session', async () => {
    spyOn(databaseService, 'createThreadForSession').and.resolveTo({
      id: 'th_brand_new',
      session_id: 'sess_test',
      title: 'New Chat',
    });
    spyOn(databaseService, 'setActiveThread').and.resolveTo();

    const res = await supertest(app)
      .post('/api/threads')
      .send({ title: 'New Chat' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.threadId).toBe('th_brand_new');
  });

  it('GET /api/threads/:threadId/messages returns messages for requested thread', async () => {
    spyOn(databaseService, 'getThreadMessages').and.resolveTo([
      { id: 10, role: 'user', content: 'Query DORA' },
    ]);

    const res = await supertest(app).get('/api/threads/th_123/messages');

    expect(res.status).toBe(200);
    expect(res.body.threadId).toBe('th_123');
    expect(res.body.messages.length).toBe(1);
  });

  it('GET /api/sessions returns paginated list of sessions', async () => {
    spyOn(databaseService, 'listSessions').and.resolveTo({
      sessions: [
        {
          id: 'sess_1',
          active_thread_id: 'th_1',
          active_thread_title: 'DORA Metrics Review',
          last_active_at: new Date().toISOString(),
          thread_count: 2,
          last_message: 'What is our deployment frequency?',
        },
        {
          id: 'sess_2',
          active_thread_id: 'th_2',
          active_thread_title: 'Sprint Planning',
          last_active_at: new Date().toISOString(),
          thread_count: 1,
          last_message: 'Calculate capacity for next sprint',
        },
      ],
      pagination: {
        total: 12,
        page: 1,
        limit: 10,
        totalPages: 2,
        hasNext: true,
        hasPrev: false,
      },
    });

    const res = await supertest(app).get('/api/sessions?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessions.length).toBe(2);
    expect(res.body.pagination.total).toBe(12);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.pagination.hasNext).toBe(true);
  });

  it('POST /api/sessions creates a new session and active thread', async () => {
    spyOn(databaseService, 'createThreadForSession').and.resolveTo({
      id: 'th_new_session_thread',
      session_id: 'sess_test',
      title: 'New Chat',
    });
    spyOn(databaseService, 'setActiveThread').and.resolveTo();

    const res = await supertest(app)
      .post('/api/sessions')
      .send({ title: 'New Conversation' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBe('sess_test');
    expect(res.body.threadId).toBe('th_new_session_thread');
  });

  it('GET /api/sessions/:sessionId/threads returns paginated threads for a session', async () => {
    spyOn(databaseService, 'listThreadsForSession').and.resolveTo({
      threads: [
        {
          id: 'th_1',
          session_id: 'sess_test',
          title: 'DORA Review',
          message_count: 4,
          last_message: 'Deployment frequency is 4/day',
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });

    const res = await supertest(app).get('/api/sessions/sess_test/threads?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBe('sess_test');
    expect(res.body.threads.length).toBe(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('POST /api/sessions/:sessionId/switch switches the active thread for the session', async () => {
    spyOn(databaseService, 'ensureThread').and.resolveTo({
      id: 'th_target',
      session_id: 'sess_test',
      title: 'Target Thread',
    });
    spyOn(databaseService, 'setActiveThread').and.resolveTo();
    spyOn(databaseService, 'getThreadMessages').and.resolveTo([
      { id: 1, role: 'user', content: 'Previous topic' },
    ]);

    const res = await supertest(app)
      .post('/api/sessions/sess_test/switch')
      .send({ threadId: 'th_target' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBe('sess_test');
    expect(res.body.threadId).toBe('th_target');
    expect(res.body.messages.length).toBe(1);
  });

  it('GET /api/session accepts query params for URL deep linking', async () => {
    spyOn(databaseService, 'getThreadMessages').and.resolveTo([
      { id: 5, role: 'user', content: 'Deep linked query' },
    ]);

    const res = await supertest(app).get('/api/session?session=sess_test&thread=th_active');

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('sess_test');
    expect(res.body.threadId).toBe('th_active');
    expect(res.body.messages.length).toBe(1);
  });
});

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
});

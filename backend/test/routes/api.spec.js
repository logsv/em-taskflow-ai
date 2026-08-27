import express from 'express';
import supertest from 'supertest';
import sinon from 'sinon';
import apiRouter from '../../src/routes/api.js';
import sessionApplicationService from '../../src/application/session/SessionApplicationService.js';

describe('API Routes (current contract)', () => {
  let app;
  let request;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
    request = supertest(app);

    sinon.stub(sessionApplicationService, 'resolveSession').resolves({
      sessionId: 'sess_test',
      threadId: 'th_test',
      created: false,
      cookieValue: null,
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('GET /api/health', () => {
    it('returns health status', async () => {
      const response = await request.get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBeDefined();
    });
  });

  describe('GET /api/session', () => {
    it('returns session information', async () => {
      const response = await request.get('/api/session');
      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBeDefined();
    });
  });

  describe('POST /api/chat', () => {
    it('validates that message is required', async () => {
      const response = await request.post('/api/chat').send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });
  });

  describe('POST /api/feedback', () => {
    it('validates that score is required', async () => {
      const response = await request.post('/api/feedback').send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });
  });

  describe('GET /api/docs', () => {
    it('serves Swagger UI html page', async () => {
      const response = await request.get('/api/docs');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Swagger API Explorer');
    });

    it('serves OpenAPI 3.1 JSON specification', async () => {
      const response = await request.get('/api/docs/openapi.json');
      expect(response.status).toBe(200);
      expect(response.body.openapi).toBe('3.1.0');
      expect(response.body.info.title).toBeDefined();
    });
  });
});

import express from 'express';
import supertest from 'supertest';
import sinon from 'sinon';
import apiRouter from '../../src/routes/api.js';
import v1Router from '../../src/routes/v1/index.js';
import sessionApplicationService from '../../src/application/session/SessionApplicationService.js';

describe('API Routes (v1 and legacy adapter contract)', () => {
  let app;
  let request;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1', v1Router);
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

  describe('Canonical v1 Routes (/api/v1)', () => {
    describe('GET /api/v1/health', () => {
      it('returns health status and X-API-Version: v1 header', async () => {
        const response = await request.get('/api/v1/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBeDefined();
        expect(response.headers['x-api-version']).toBe('v1');
      });
    });

    describe('GET /api/v1/session', () => {
      it('returns session information', async () => {
        const response = await request.get('/api/v1/session');
        expect(response.status).toBe(200);
        expect(response.body.sessionId).toBeDefined();
      });
    });

    describe('POST /api/v1/chat', () => {
      it('validates that message is required', async () => {
        const response = await request.post('/api/v1/chat').send({});
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
      });
    });

    describe('POST /api/v1/feedback', () => {
      it('validates that score is required', async () => {
        const response = await request.post('/api/v1/feedback').send({});
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
      });
    });

    describe('GET /api/v1/docs', () => {
      it('serves Swagger UI html page', async () => {
        const response = await request.get('/api/v1/docs');
        expect(response.status).toBe(200);
        expect(response.text).toContain('Swagger API Explorer');
      });

      it('serves OpenAPI 3.1 JSON specification', async () => {
        const response = await request.get('/api/v1/docs/openapi.json');
        expect(response.status).toBe(200);
        expect(response.body.openapi).toBe('3.1.0');
        expect(response.body.info.title).toBeDefined();
      });
    });
  });

  describe('Legacy Backward-Compatibility Adapter (/api)', () => {
    it('returns health status with deprecation headers', async () => {
      const response = await request.get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBeDefined();
      expect(response.headers['deprecation']).toBe('true');
      expect(response.headers['sunset']).toBeDefined();
      expect(response.headers['link']).toContain('/api/v1/health');
      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('returns session info with deprecation headers', async () => {
      const response = await request.get('/api/session');
      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBeDefined();
      expect(response.headers['deprecation']).toBe('true');
      expect(response.headers['link']).toContain('/api/v1/session');
    });
  });
});

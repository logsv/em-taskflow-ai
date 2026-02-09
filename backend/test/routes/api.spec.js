import express from 'express';
import request from 'supertest';
import apiRouter from '../../src/routes/api.js';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);
let server;

beforeAll((done) => {
  server = app.listen(0, done);
});

afterAll((done) => {
  if (server) {
    server.close(done);
    return;
  }
  done();
});

describe('API Routes (current contract)', () => {
  describe('GET /api/health', () => {
    it('returns healthy status', async () => {
      const response = await request(server).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.services).toBeDefined();
    });
  });

  describe('GET /api/llm-status', () => {
    it('returns default provider/model info', async () => {
      const response = await request(server).get('/api/llm-status');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.provider).toBeDefined();
    });
  });

  describe('POST /api/upload-pdf', () => {
    it('validates that file is required', async () => {
      const response = await request(server).post('/api/upload-pdf');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
    });
  });

  describe('POST /api/rag/query', () => {
    it('rejects missing body fields', async () => {
      const response = await request(server).post('/api/rag/query').send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request body');
    });

    it('rejects advanced mode when disabled', async () => {
      const response = await request(server)
        .post('/api/rag/query')
        .send({ query: 'test', mode: 'advanced' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Advanced RAG mode is disabled');
    });
  });
});

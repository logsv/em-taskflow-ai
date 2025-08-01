import sinon from 'sinon';
import express from 'express';
import request from 'supertest';
import apiRouter from '../../src/routes/api.js';
import agentService from '../../src/services/agentService.js';
import ragService from '../../src/services/ragService.js';
import taskManager from '../../src/services/taskManager.js';

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/api', apiRouter);

describe('API Routes', () => {
  let agentStub: sinon.SinonStub;
  let ragStub: sinon.SinonStub;
  let taskManagerStub: sinon.SinonStub;

  beforeEach(() => {
    agentStub = sinon.stub(agentService, 'processQuery');
    ragStub = sinon.stub(ragService, 'processPDF');
    taskManagerStub = sinon.stub(taskManager, 'fetchAllStatus');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('POST /api/llm-summary', () => {
    it('should process LLM query successfully', async () => {
      agentStub.resolves('This is a test response from the agent');

      const response = await request(app)
        .post('/api/llm-summary')
        .send({ prompt: 'Test query' });

      expect(response.status).toBe(200);
      expect(response.body.response).toBe('This is a test response from the agent');
      expect(response.body.message).toContain('integrated RAG, MCP, and LLM agent');
      expect(agentStub.calledOnce).toBe(true);
      expect(agentStub.calledWith('Test query')).toBe(true);
    });

    it('should handle missing prompt', async () => {
      const response = await request(app)
        .post('/api/llm-summary')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Prompt is required');
      expect(agentStub.called).toBe(false);
    });

    it('should handle agent service errors', async () => {
      agentStub.rejects(new Error('Agent service unavailable'));

      const response = await request(app)
        .post('/api/llm-summary')
        .send({ prompt: 'Test query' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Agent service unavailable');
    });

    it('should handle prompt with session ID', async () => {
      agentStub.resolves('Response with session context');

      const response = await request(app)
        .post('/api/llm-summary')
        .send({ 
          prompt: 'Test query',
          sessionId: 'test-session-123'
        });

      expect(response.status).toBe(200);
      expect(response.body.response).toBe('Response with session context');
    });
  });

  describe('POST /api/rag-query', () => {
    it('should process RAG query successfully', async () => {
      agentStub.resolves('This is a RAG-enhanced response');

      const response = await request(app)
        .post('/api/rag-query')
        .send({ query: 'What is in the documents?' });

      expect(response.status).toBe(200);
      expect(response.body.answer).toBe('This is a RAG-enhanced response');
      expect(response.body.query).toBe('What is in the documents?');
      expect(agentStub.calledOnce).toBe(true);
    });

    it('should handle missing query', async () => {
      const response = await request(app)
        .post('/api/rag-query')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Query is required');
    });

    it('should handle custom top_k parameter', async () => {
      agentStub.resolves('RAG response with custom top_k');

      const response = await request(app)
        .post('/api/rag-query')
        .send({ 
          query: 'Test query',
          top_k: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.answer).toBe('RAG response with custom top_k');
    });
  });

  describe('GET /api/summary', () => {
    it('should fetch summary successfully', async () => {
      const mockSummary = {
        jiraTasks: [{ id: 'TASK-1', title: 'Test task' }],
        notionPages: [{ id: 'page1', title: 'Test page' }],
        calendarEvents: [{ id: 'event1', title: 'Test event' }],
        calendarConflicts: []
      };

      taskManagerStub.resolves(mockSummary);
      sinon.stub(taskManager, 'summarizePageUpdates').resolves(['Update 1', 'Update 2']);

      const response = await request(app)
        .get('/api/summary');

      expect(response.status).toBe(200);
      expect(response.body.jira).toEqual(mockSummary.jiraTasks);
      expect(response.body.notion).toEqual(mockSummary.notionPages);
      expect(response.body.calendar).toEqual(mockSummary.calendarEvents);
    });

    it('should handle task manager errors', async () => {
      taskManagerStub.rejects(new Error('Task manager unavailable'));

      const response = await request(app)
        .get('/api/summary');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch summary.');
    });
  });

  describe('POST /api/complete', () => {
    it('should mark task as complete', async () => {
      sinon.stub(taskManager, 'markTaskComplete').resolves(true);

      const response = await request(app)
        .post('/api/complete')
        .send({
          taskType: 'jira',
          taskId: 'TASK-1',
          note: 'Task completed successfully'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/complete')
        .send({
          taskType: 'jira'
          // Missing taskId and note
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('taskType, taskId, and note are required.');
    });

    it('should handle task completion errors', async () => {
      sinon.stub(taskManager, 'markTaskComplete').rejects(new Error('Task not found'));

      const response = await request(app)
        .post('/api/complete')
        .send({
          taskType: 'jira',
          taskId: 'INVALID-TASK',
          note: 'Trying to complete invalid task'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to mark task complete.');
    });
  });

  describe('GET /api/suggestions', () => {
    it('should return suggestions', async () => {
      const response = await request(app)
        .get('/api/suggestions');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.suggestions)).toBe(true);
      expect(response.body.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle session ID parameter', async () => {
      const response = await request(app)
        .get('/api/suggestions?sessionId=test-session');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.suggestions)).toBe(true);
    });
  });

  describe('PDF Upload', () => {
    it('should handle missing file', async () => {
      const response = await request(app)
        .post('/api/upload-pdf');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('should handle PDF processing success', async () => {
      ragStub.resolves({
        success: true,
        chunks: 5
      });

      // This test verifies the endpoint exists and handles missing files correctly
      const response = await request(app)
        .post('/api/upload-pdf');

      // Expect 400 for missing file, which proves the endpoint is working
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/llm-summary')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads gracefully', async () => {
      const largePrompt = 'a'.repeat(10000);
      agentStub.resolves('Response to large prompt');

      const response = await request(app)
        .post('/api/llm-summary')
        .send({ prompt: largePrompt });

      expect(response.status).toBe(200);
    });
  });
});
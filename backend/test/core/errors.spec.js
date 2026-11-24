import express from 'express';
import request from 'supertest';
import { AppError, classifyError, toClientError } from '../../src/core/errors.js';
import { sendError, errorHandler } from '../../src/middleware/errorHandler.js';
import { getCounter, resetMetrics, incCounter, renderPrometheus } from '../../src/core/metrics.js';
import { swallow, background } from '../../src/core/safe.js';

describe('Error taxonomy', () => {
  beforeEach(() => resetMetrics());

  it('classifies common library failures', () => {
    expect(classifyError(new Error('LLM request timed out after 30s')).code).toBe('LLM_TIMEOUT');
    expect(classifyError(new Error('connect ECONNREFUSED 127.0.0.1:11434')).code).toBe('LLM_UNAVAILABLE');
    expect(classifyError(new Error('connect ECONNREFUSED 127.0.0.1:5432')).code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(classifyError(Object.assign(new Error('Request failed'), { response: { status: 401 } })).code).toBe('INTEGRATION_UNAUTHORIZED');
    expect(classifyError(Object.assign(new Error('Request failed'), { response: { status: 503 } })).code).toBe('INTEGRATION_UNAVAILABLE');
    expect(classifyError(new Error('something odd')).code).toBe('INTERNAL');
  });

  it('never exposes raw internal messages to clients', () => {
    const { status, body } = toClientError(new Error('relation "secret_table" does not exist'), 'req-1');
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('secret_table');
    expect(body.requestId).toBe('req-1');
  });

  it('keeps AppError codes and statuses', () => {
    const { status, body } = toClientError(new AppError('NOT_FOUND', 'Thread not found.'));
    expect(status).toBe(404);
    expect(body).toEqual(jasmine.objectContaining({ code: 'NOT_FOUND', error: 'Thread not found.' }));
  });

  it('sendError and the Express handler respond with coded JSON and count the error', async () => {
    const app = express();
    app.get('/route', (req, res) => sendError(req, res, new Error('timed out talking to llm'), 'test'));
    app.get('/throws', () => {
      throw new Error('boom');
    });
    app.use(errorHandler);

    const a = await request(app).get('/route').expect(504);
    expect(a.body.code).toBe('LLM_TIMEOUT');
    const b = await request(app).get('/throws').expect(500);
    expect(b.body.code).toBe('INTERNAL');
    expect(getCounter('http_errors_total', { code: 'INTERNAL', status: '500' })).toBe(1);
  });
});

describe('Visible failure helpers', () => {
  beforeEach(() => resetMetrics());

  it('swallow returns the fallback and counts the error', async () => {
    const value = await Promise.reject(new Error('db down')).catch(swallow('test.site', []));
    expect(value).toEqual([]);
    expect(getCounter('handled_errors_total', { context: 'test.site' })).toBe(1);
  });

  it('background counts failed tasks without throwing', async () => {
    background('test.task', () => {
      throw new Error('nope');
    });
    await new Promise((r) => setImmediate(() => setImmediate(r)));
    expect(getCounter('background_tasks_total', { name: 'test.task', outcome: 'failed' })).toBe(1);
  });

  it('renders Prometheus text with escaped labels', () => {
    incCounter('demo_total', { reason: 'a "quoted" value' }, 2, 'Demo counter');
    const text = renderPrometheus();
    expect(text).toContain('# TYPE demo_total counter');
    expect(text).toContain('demo_total{reason="a \\"quoted\\" value"} 2');
  });
});

import express from 'express';
import supertest from 'supertest';
import apiRouter from '../../src/routes/api.js';
import databaseService from '../../src/db/postgres.js';

describe('GET /api/actions/health-trend', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const request = supertest(app);
  const day = 24 * 60 * 60 * 1000;
  const ago = (n) => new Date(Date.now() - n * day).toISOString();

  it('returns measured scores oldest first and leaves out failed, unmeasured and old runs', async () => {
    spyOn(databaseService, 'listAuditRuns').and.resolveTo([
      { id: 4, status: 'COMPLETED', healthScore: 80, createdAt: ago(1) },
      { id: 3, status: 'FAILED', healthScore: null, createdAt: ago(2) },
      { id: 2, status: 'COMPLETED', healthScore: null, createdAt: ago(3) },
      { id: 1, status: 'COMPLETED', healthScore: 65, createdAt: ago(5) },
      { id: 0, status: 'COMPLETED', healthScore: 40, createdAt: ago(60) },
    ]);
    const res = await request.get('/api/actions/health-trend?days=30').expect(200);
    expect(res.body.points.map((p) => p.auditRunId)).toEqual([1, 4]);
    expect(res.body.change).toBe(15);
  });

  it('says there is no data instead of inventing a trend', async () => {
    spyOn(databaseService, 'listAuditRuns').and.resolveTo([]);
    const res = await request.get('/api/actions/health-trend').expect(200);
    expect(res.body.points).toEqual([]);
    expect(res.body.change).toBeNull();
    expect(res.body.message).toContain('No completed audits');
  });
});

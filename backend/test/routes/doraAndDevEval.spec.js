import express from 'express';
import supertest from 'supertest';
import { buildDoraResponse } from '../../src/routes/v1/em.js';
import adminRouter from '../../src/routes/admin/index.js';
import { config } from '../../src/config.js';

describe('DORA endpoint response', () => {
  it('returns no numbers at all when no snapshot exists', () => {
    const res = buildDoraResponse([]);
    expect(res.measured).toBeFalse();
    expect(res.rating).toBeNull();
    for (const m of Object.values(res.metrics)) {
      expect(m.value).toBeNull();
      expect(m.trend).toBeNull();
    }
    expect(res.metrics.availability_slo.status).toBe('NOT_MEASURED');
    expect(res.message).toContain('No DORA snapshot');
  });

  it('uses measured values only, keeps missing fields null, and computes trends from the previous snapshot', () => {
    const res = buildDoraResponse([
      { deployment_frequency: '10', lead_time_hours: '12', change_failure_rate: null, mttr_hours: '1' },
      { deployment_frequency: '8', lead_time_hours: '24', change_failure_rate: '3', mttr_hours: '1' },
    ]);
    expect(res.metrics.deployment_frequency.value).toBe('10 / week');
    expect(res.metrics.deployment_frequency.trend).toBe('+25.0%');
    expect(res.metrics.lead_time.trend).toBe('-50.0%');
    expect(res.metrics.change_failure_rate.value).toBeNull(); // not filled with a default
    expect(res.rating).toBeNull(); // cannot rate without all three of LT, CFR, MTTR
  });

  it('has no trend with a single snapshot', () => {
    const res = buildDoraResponse([{ deployment_frequency: 2, lead_time_hours: 30, change_failure_rate: 10, mttr_hours: 5 }]);
    expect(res.rating).toBe('HIGH');
    expect(res.metrics.lead_time.trend).toBeNull();
  });
});

describe('Developer evaluation routes', () => {
  let saved;
  beforeEach(() => { saved = config.features.devEvalRoutes; });
  afterEach(() => { config.features.devEvalRoutes = saved; });

  const app = () => {
    const a = express();
    a.use(express.json());
    a.use('/api/admin', adminRouter);
    return supertest(a);
  };

  it('are off by default and say how to enable them', async () => {
    config.features.devEvalRoutes = false;
    const res = await app().get('/api/admin/eval/metrics').expect(404);
    expect(res.body.code).toBe('FEATURE_DISABLED');
    expect(res.body.error).toContain('ENABLE_DEV_EVAL_ROUTES');
  });

  it('are mounted when ENABLE_DEV_EVAL_ROUTES is on', async () => {
    config.features.devEvalRoutes = true;
    const res = await app().get('/api/admin/eval/metrics');
    expect(res.status).not.toBe(404);
  });
});

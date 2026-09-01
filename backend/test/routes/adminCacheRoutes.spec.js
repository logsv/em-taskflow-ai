import express from 'express';
import supertest from 'supertest';
import adminRouter from '../../src/routes/admin.js';
import { l1ExactCache } from '../../src/cache/l1ExactCache.js';
import { toolCache } from '../../src/cache/toolCache.js';
import { cacheInvalidator } from '../../src/cache/cacheInvalidator.js';

describe('Admin Cache Management Endpoints Contract', () => {
  let app;
  let request;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    request = supertest(app);

    l1ExactCache.clear();
    toolCache.cache.clear();
  });

  afterEach(async () => {
    await cacheInvalidator.invalidateAll();
  });

  describe('GET /api/admin/cache/stats', () => {
    it('should return live metrics for all 3 caching tiers', async () => {
      l1ExactCache.set('q1', 'ans1', [], { domain: 'dora' });
      toolCache.set('jira_search', { jql: 'status = open' }, { total: 5 });

      const res = await request
        .get('/api/admin/cache/stats')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.tiers).toBeDefined();
      expect(res.body.tiers.l1_exact_in_memory).toBeDefined();
      expect(res.body.tiers.l1_exact_in_memory.size).toBeGreaterThanOrEqual(1);
      expect(res.body.tiers.tier2_mcp_tool_cache).toBeDefined();
      expect(res.body.tiers.tier2_mcp_tool_cache.size).toBeGreaterThanOrEqual(1);
      expect(res.body.tiers.l2_semantic_redis).toBeDefined();
      expect(res.body.tiers.l2_semantic_redis.similarityThreshold).toBe(0.95);
    });
  });

  describe('POST /api/admin/cache/flush', () => {
    it('should flush all cache tiers when all: true is passed', async () => {
      l1ExactCache.set('test_q1', 'ans1', [], { domain: 'sprint' });
      toolCache.set('github_list_prs', { repo: 'taskflow' }, []);

      const res = await request
        .post('/api/admin/cache/flush')
        .send({ all: true })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.flushed).toBe('all');
      expect(l1ExactCache.get('test_q1', { domain: 'sprint' })).toBeNull();
      expect(toolCache.get('github_list_prs', { repo: 'taskflow' })).toBeNull();
    });

    it('should flush targeted domain entries when domain is specified', async () => {
      l1ExactCache.set('dora_q', 'dora_ans', [], { domain: 'dora' });
      l1ExactCache.set('people_q', 'people_ans', [], { domain: 'people' });

      const res = await request
        .post('/api/admin/cache/flush')
        .send({ domain: 'dora' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('dora');
      expect(l1ExactCache.get('dora_q', { domain: 'dora' })).toBeNull();
      expect(l1ExactCache.get('people_q', { domain: 'people' })).not.toBeNull();
    });

    it('should flush document-specific entries when documentFilename is specified', async () => {
      l1ExactCache.set('doc_q', 'doc_ans', [{ metadata: { filename: 'guide.pdf' } }], { domain: 'rag' });

      const res = await request
        .post('/api/admin/cache/flush')
        .send({ documentFilename: 'guide.pdf' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('guide.pdf');
      expect(l1ExactCache.get('doc_q', { domain: 'rag' })).toBeNull();
    });
  });
});

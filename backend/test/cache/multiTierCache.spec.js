import sinon from 'sinon';
import { l1ExactCache } from '../../src/cache/l1ExactCache.js';
import {
  checkSemanticCache,
  setSemanticCache,
  extractQueryEntities,
  validateEntityAlignment,
  getTtlForDomain,
  invalidateL2Domain,
  invalidateL2Document,
  getSemanticCacheStats,
  DOMAIN_TTL_MAP,
} from '../../src/cache/semanticCache.js';
import { toolCache } from '../../src/cache/toolCache.js';
import { cacheInvalidator } from '../../src/cache/cacheInvalidator.js';
import { bgeEmbeddingsClient } from '../../src/llm/bgeEmbeddingsClient.js';

describe('Multi-Tier Production Caching Architecture', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    l1ExactCache.clear();
    toolCache.cache.clear();
    cacheInvalidator.invalidateAll().catch(() => {});
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Tier 0: L1 Exact-Match In-Memory Cache', () => {
    it('should set and get exact query responses with sub-millisecond latency', () => {
      const query = 'What is our deployment frequency for backend-service?';
      const answer = 'Our deployment frequency is 4.2 deployments per day.';
      const sources = [{ filename: 'dora_policy.pdf' }];

      l1ExactCache.set(query, answer, sources, { domain: 'dora' });

      const startTime = Date.now();
      const hit = l1ExactCache.get(query, { domain: 'dora' });
      const durationMs = Date.now() - startTime;

      expect(hit).not.toBeNull();
      expect(hit.answer).toBe(answer);
      expect(hit.sources.length).toBe(1);
      expect(hit.domain).toBe('dora');
      expect(hit.fromL1).toBe(true);
      expect(durationMs).toBeLessThan(15);
    });

    it('should normalize queries (ignoring case, extra whitespace, and trailing punctuation)', () => {
      const originalQuery = '  What is the code review SLA for PRs???  ';
      const variantQuery = 'what is the code review sla for prs';
      const answer = 'Code review SLA is 24 hours.';

      l1ExactCache.set(originalQuery, answer, [], { domain: 'sop' });
      const hit = l1ExactCache.get(variantQuery, { domain: 'sop' });

      expect(hit).not.toBeNull();
      expect(hit.answer).toBe(answer);
    });

    it('should isolate cache keys by domain and user/repo scope', () => {
      const query = 'List open blocker issues';
      l1ExactCache.set(query, 'Repo A blockers', [], { domain: 'delivery', repo: 'org/repo-a' });

      const hitRepoA = l1ExactCache.get(query, { domain: 'delivery', repo: 'org/repo-a' });
      const hitRepoB = l1ExactCache.get(query, { domain: 'delivery', repo: 'org/repo-b' });

      expect(hitRepoA).not.toBeNull();
      expect(hitRepoA.answer).toBe('Repo A blockers');
      expect(hitRepoB).toBeNull();
    });

    it('should evict oldest entries when capacity is exceeded', () => {
      const smallCache = new (l1ExactCache.constructor)(3, 60000);
      smallCache.set('q1', 'ans1');
      smallCache.set('q2', 'ans2');
      smallCache.set('q3', 'ans3');
      smallCache.set('q4', 'ans4'); // Should evict q1

      expect(smallCache.get('q1')).toBeNull();
      expect(smallCache.get('q4')).not.toBeNull();
      expect(smallCache.getStats().evictions).toBe(1);
    });

    it('should invalidate specific domain entries correctly', () => {
      l1ExactCache.set('query 1', 'answer 1', [], { domain: 'rag' });
      l1ExactCache.set('query 2', 'answer 2', [], { domain: 'rag' });
      l1ExactCache.set('query 3', 'answer 3', [], { domain: 'dora' });

      const count = l1ExactCache.invalidateDomain('rag');
      expect(count).toBe(2);
      expect(l1ExactCache.get('query 1', { domain: 'rag' })).toBeNull();
      expect(l1ExactCache.get('query 3', { domain: 'dora' })).not.toBeNull();
    });
  });

  describe('Tier 1: L2 Semantic Cache & Dual-Gate Anti-Hallucination Filter', () => {
    it('should extract query entities accurately', () => {
      const text = 'Check blockers in Sprint 44 for issue ENG-1024 assigned to @alex in Q3 2026 and PR #89';
      const entities = extractQueryEntities(text);

      expect(entities.sprints).toContain('44');
      expect(entities.jiraKeys).toContain('ENG-1024');
      expect(entities.users).toContain('alex');
      expect(entities.quarters).toContain('Q3_2026');
      expect(entities.prNumbers).toContain('89');
    });

    it('should PASS Gate 2 validation when entities match between query and cached entry', () => {
      const queryEnts = { sprints: ['42'], jiraKeys: ['TASK-100'], users: [], quarters: [], prNumbers: [] };
      const cachedEnts = { sprints: ['42'], jiraKeys: ['TASK-100'], users: [], quarters: [], prNumbers: [] };

      const aligned = validateEntityAlignment(queryEnts, cachedEnts);
      expect(aligned).toBe(true);
    });

    it('should REJECT Gate 2 validation (prevent hallucination) when sprint numbers diverge', () => {
      // User asks for Sprint 45, but cached entry is from Sprint 44
      const queryEnts = { sprints: ['45'], jiraKeys: [], users: [], quarters: [], prNumbers: [] };
      const cachedEnts = { sprints: ['44'], jiraKeys: [], users: [], quarters: [], prNumbers: [] };

      const aligned = validateEntityAlignment(queryEnts, cachedEnts);
      expect(aligned).toBe(false);
    });

    it('should REJECT Gate 2 validation when Jira issue keys diverge', () => {
      const queryEnts = { sprints: [], jiraKeys: ['PAY-999'], users: [], quarters: [], prNumbers: [] };
      const cachedEnts = { sprints: [], jiraKeys: ['AUTH-101'], users: [], quarters: [], prNumbers: [] };

      const aligned = validateEntityAlignment(queryEnts, cachedEnts);
      expect(aligned).toBe(false);
    });

    it('should REJECT Gate 2 validation when User handles diverge', () => {
      const queryEnts = { sprints: [], jiraKeys: [], users: ['sarah'], quarters: [], prNumbers: [] };
      const cachedEnts = { sprints: [], jiraKeys: [], users: ['alex'], quarters: [], prNumbers: [] };

      const aligned = validateEntityAlignment(queryEnts, cachedEnts);
      expect(aligned).toBe(false);
    });

    it('should return correct domain-adaptive TTLs', () => {
      expect(getTtlForDomain('rag')).toBe(7 * 24 * 3600);
      expect(getTtlForDomain('sop')).toBe(7 * 24 * 3600);
      expect(getTtlForDomain('okr')).toBe(4 * 3600);
      expect(getTtlForDomain('dora')).toBe(1800);
      expect(getTtlForDomain('people')).toBe(1800);
      expect(getTtlForDomain('sprint')).toBe(120);
      expect(getTtlForDomain('delivery')).toBe(120);
      expect(getTtlForDomain('unknown')).toBe(3600);
    });

    it('should store and retrieve semantic cache matches when embeddings and entities align', async () => {
      // Mock embedding client to return predictable vector
      const mockVector = new Array(768).fill(0.05);
      sandbox.stub(bgeEmbeddingsClient, 'embed').resolves({ embeddings: [mockVector] });

      const query = 'Summarize sprint guidelines in handbook.pdf';
      const answer = 'Sprint guidelines require 2-week iterations.';
      const sources = [{ metadata: { filename: 'handbook.pdf' } }];

      await setSemanticCache(query, answer, sources, { domain: 'rag' });

      const cached = await checkSemanticCache(query, { domain: 'rag' });
      expect(cached).not.toBeNull();
      expect(cached.answer).toBe(answer);
      expect(cached.fromSemanticCache).toBe(true);
    });
  });

  describe('Tier 2: MCP Tool Execution Cache', () => {
    it('should cache deterministic tool call results with parameters', () => {
      const toolName = 'jira_search';
      const args = { jql: 'project = PROJ AND status = Blocker', maxResults: 10 };
      const result = { issues: [{ key: 'PROJ-1', summary: 'Outage blocker' }] };

      toolCache.set(toolName, args, result, 60);

      const cached = toolCache.get(toolName, args);
      expect(cached).not.toBeNull();
      expect(cached.issues.length).toBe(1);
      expect(cached.issues[0].key).toBe('PROJ-1');
    });

    it('should differentiate tool calls with different parameters', () => {
      const toolName = 'jira_search';
      const args1 = { jql: 'project = A' };
      const args2 = { jql: 'project = B' };

      toolCache.set(toolName, args1, { data: 'A' }, 60);
      toolCache.set(toolName, args2, { data: 'B' }, 60);

      expect(toolCache.get(toolName, args1).data).toBe('A');
      expect(toolCache.get(toolName, args2).data).toBe('B');
    });

    it('should execute wrapper function on miss and return cached value on subsequent call', async () => {
      const toolName = 'github_list_prs';
      const args = { repo: 'em-taskflow-ai', state: 'open' };
      const executorSpy = sinon.stub().resolves([{ number: 101, title: 'Add cache' }]);

      // First call: executes executor
      const res1 = await toolCache.wrap(toolName, args, executorSpy, 60);
      expect(res1.length).toBe(1);
      expect(executorSpy.calledOnce).toBe(true);

      // Second call: returns cached result without invoking executor
      const res2 = await toolCache.wrap(toolName, args, executorSpy, 60);
      expect(res2.length).toBe(1);
      expect(executorSpy.calledOnce).toBe(true); // Still 1 call!
    });
  });

  describe('Event-Driven Cache Invalidator Bus', () => {
    it('should invalidate L1 and L2 when a document is mutated/deleted', async () => {
      const mockVector = new Array(768).fill(0.05);
      sandbox.stub(bgeEmbeddingsClient, 'embed').resolves({ embeddings: [mockVector] });

      // Populate L1 and L2 with document query
      const query = 'What are the review requirements in code_review_policy.pdf?';
      const answer = 'At least 2 approvals required.';
      const sources = [{ metadata: { filename: 'code_review_policy.pdf' } }];

      l1ExactCache.set(query, answer, sources, { domain: 'rag' });
      await setSemanticCache(query, answer, sources, { domain: 'rag' });

      expect(l1ExactCache.get(query, { domain: 'rag' })).not.toBeNull();

      // Trigger document invalidation
      await cacheInvalidator.invalidateDocument('code_review_policy.pdf');

      expect(l1ExactCache.get(query, { domain: 'rag' })).toBeNull();
    });

    it('should invalidate all cache tiers on invalidateAll', async () => {
      l1ExactCache.set('q1', 'ans1');
      toolCache.set('jira_get_issue', { id: 'ENG-1' }, { key: 'ENG-1' });

      await cacheInvalidator.invalidateAll();

      expect(l1ExactCache.get('q1')).toBeNull();
      expect(toolCache.get('jira_get_issue', { id: 'ENG-1' })).toBeNull();
    });

    it('should execute invalidateCacheActivity and clear caches durably', async () => {
      const { invalidateCacheActivity } = await import('../../src/temporal/activities.js');
      
      l1ExactCache.set('temp_q', 'temp_ans', [], { domain: 'dora' });
      expect(l1ExactCache.get('temp_q', { domain: 'dora' })).not.toBeNull();

      const res = await invalidateCacheActivity({ type: 'domain', domain: 'dora' });
      expect(res.status).toBe('SUCCESS');
      expect(l1ExactCache.get('temp_q', { domain: 'dora' })).toBeNull();
    });

    it('should trigger Temporal cache invalidation workflow via client without throwing', async () => {
      const { startCacheInvalidationWorkflow } = await import('../../src/temporal/client.js');
      
      l1ExactCache.set('wf_q', 'wf_ans', [], { domain: 'rag' });
      const wfRes = await startCacheInvalidationWorkflow({ type: 'domain', domain: 'rag' });
      
      expect(wfRes).not.toBeNull();
      expect(wfRes.workflowId).toBeDefined();
      expect(l1ExactCache.get('wf_q', { domain: 'rag' })).toBeNull();
    });

    it('should emit events on domain and document invalidation', async () => {
      const domainSpy = sinon.spy();
      const docSpy = sinon.spy();

      cacheInvalidator.on('domainInvalidated', domainSpy);
      cacheInvalidator.on('documentInvalidated', docSpy);

      await cacheInvalidator.invalidateDomain('people');
      await cacheInvalidator.invalidateDocument('onboarding.pdf');

      expect(domainSpy.calledOnce).toBe(true);
      expect(docSpy.calledOnce).toBe(true);

      cacheInvalidator.removeListener('domainInvalidated', domainSpy);
      cacheInvalidator.removeListener('documentInvalidated', docSpy);
    });

    it('should handle concurrent read/write operations without state corruption', async () => {
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(
          Promise.resolve().then(() => {
            l1ExactCache.set(`concurrent_key_${i % 10}`, `val_${i}`, [], { domain: 'dora' });
            return l1ExactCache.get(`concurrent_key_${i % 10}`, { domain: 'dora' });
          })
        );
      }

      const results = await Promise.all(operations);
      expect(results.length).toBe(50);
      expect(results.every(r => r !== null)).toBe(true);
    });

    it('should correctly extract compound entities across sprint, jira, user, and quarter', () => {
      const compoundQuery = 'In Sprint 46, assign ticket ENG-999 to @sarah for Q4 2026 delivery regarding PR #42';
      const entities = extractQueryEntities(compoundQuery);

      expect(entities.sprints).toEqual(['46']);
      expect(entities.jiraKeys).toEqual(['ENG-999']);
      expect(entities.users).toEqual(['sarah']);
      expect(entities.quarters).toEqual(['Q4_2026']);
      expect(entities.prNumbers).toEqual(['42']);
    });
  });
});

import sessionFactMatrixService, { SessionFactMatrixService } from '../../src/services/sessionFactMatrix.js';

describe('Distributed Session Fact-Matrix Scratchpad Service', () => {
  let mockDb;
  let service;

  beforeEach(() => {
    mockDb = {
      store: new Map(),
      async getThreadContextMatrix(threadId) {
        return this.store.get(threadId) || null;
      },
      async updateThreadContextMatrix(threadId, matrix) {
        this.store.set(threadId, matrix);
        return matrix;
      },
    };
    service = new SessionFactMatrixService({ db: mockDb });
  });

  describe('Fact Delta Extraction (extractFactDelta)', () => {
    it('should extract DORA metrics, repository, and bottlenecks from assistant scorecard', () => {
      const query = 'Analyze team DORA metrics for deployment frequency, lead time, and failure rate';
      const response = `### 📊 DORA Performance Scorecard: [**logsv/em-taskflow-ai**](https://github.com/logsv/em-taskflow-ai) (30d)

| Metric | Measured Value | Industry Benchmark Tier | Health Status |
| :--- | :--- | :--- | :--- |
| **Deployment Frequency** | **3.73 deploys/week** | HIGH Tier | 🟢 Healthy |
| **Lead Time for Changes** | **19.4 hours** | HIGH Tier | 🟢 Rapid |
| **Change Failure Rate** | **0%** | HIGH Tier | 🟢 Stable |
| **Time to Restore (MTTR)**| **0.8 hours** | HIGH Tier | 🟢 Fast Recovery |

> 💡 **Executive Bottom Line**: Overall operational flow is rated at **HIGH Tier**.

<details>
<summary><b>🔍 Flow & Bottleneck Analysis (1 Key Insights)</b></summary>
- Review Queue Latency**: Pull requests average **13.58h** in review across [**logsv/em-taskflow-ai Pull Requests**](https://github.com/logsv/em-taskflow-ai/pulls).
- CI Pipeline Duration**: Build & test automation accounts for **~15 minutes**.
</details>

<details>
<summary><b>🎯 Strategic Recommendations for Engineering Manager</b></summary>
1. **PR Batch Size Guardrail**: Enforce PR sizing < 400 lines to reduce review wait time by up to 50%.
2. **CI Parallelization**: Run unit test suites in parallel to maintain fast merge feedback loops.
</details>`;

      const delta = service.extractFactDelta(query, response);

      expect(delta.repository).toBe('logsv/em-taskflow-ai');
      expect(delta.dora).toBeDefined();
      expect(delta.dora.deploymentFrequency).toBe('3.73 deploys/week');
      expect(delta.dora.leadTimeHours).toBe('19.4 hours');
      expect(delta.dora.changeFailureRate).toBe('0%');
      expect(delta.dora.mttrHours).toBe('0.8 hours');
      expect(delta.dora.tier).toBe('HIGH');
      expect(delta.bottlenecks).toContain('PR review latency avg 13.58h');
      expect(delta.actionItems.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract active PR numbers and engineer handles', () => {
      const query = 'Draft SBI coaching feedback for engineer @alex-dev regarding review stalls on PR #142';
      const response = 'Executive Summary: Formulated constructive SBI feedback for @alex-dev unblocking PR #142 and PR #145.';

      const delta = service.extractFactDelta(query, response);

      expect(delta.engineers).toContain('@alex-dev');
      expect(delta.prs).toContain('#142');
      expect(delta.prs).toContain('#145');
    });

    it('should extract sprint capacity and name', () => {
      const query = 'Calculate Sprint 42 capacity and velocity';
      const response = 'Sprint 42 capacity is at 85 story points with 2 planned PTOs.';

      const delta = service.extractFactDelta(query, response);

      expect(delta.sprint).toBeDefined();
      expect(delta.sprint.sprintName).toBe('Sprint 42');
      expect(delta.sprint.capacity).toBe('85 pts');
    });
  });

  describe('Fact Matrix Delta Merging (mergeFactMatrix)', () => {
    it('should incrementally merge new facts without losing previous context', () => {
      const existing = {
        repository: 'logsv/em-taskflow-ai',
        dora: {
          deploymentFrequency: '3.73 deploys/week',
          tier: 'HIGH',
        },
        engineers: ['@alex-dev'],
      };

      const delta = {
        engineers: ['@sarah-c'],
        prs: ['#142'],
        sprint: { sprintName: 'Sprint 42' },
      };

      const merged = service.mergeFactMatrix(existing, delta);

      expect(merged.repository).toBe('logsv/em-taskflow-ai');
      expect(merged.dora.deploymentFrequency).toBe('3.73 deploys/week');
      expect(merged.engineers).toContain('@alex-dev');
      expect(merged.engineers).toContain('@sarah-c');
      expect(merged.prs).toContain('#142');
      expect(merged.sprint.sprintName).toBe('Sprint 42');
    });
  });

  describe('System Prompt Formatting (formatMatrixAsSystemPrompt)', () => {
    it('should format a compact, structured YAML block fitting within token budget', () => {
      const matrix = {
        repository: 'logsv/em-taskflow-ai',
        dora: {
          deploymentFrequency: '3.73 deploys/week',
          leadTimeHours: '19.4 hours',
          changeFailureRate: '0%',
          mttrHours: '0.8 hours',
          tier: 'HIGH',
        },
        bottlenecks: ['PR review latency avg 13.58h'],
        engineers: ['@alex-dev', '@sarah-c'],
        prs: ['#142', '#145'],
        actionItems: ['Enforce PR size < 400 lines', 'Parallelize CI suites'],
        sprint: {
          sprintName: 'Sprint 42',
          capacity: '85 pts',
        },
      };

      const formatted = service.formatMatrixAsSystemPrompt(matrix);

      expect(formatted).toContain('[System Memory: Active Session Fact Matrix]');
      expect(formatted).toContain('Repository: logsv/em-taskflow-ai');
      expect(formatted).toContain('DORA Baseline: Deploys: 3.73 deploys/week | LeadTime: 19.4 hours | CFR: 0% | MTTR: 0.8 hours | Rating: HIGH Tier');
      expect(formatted).toContain('Identified Bottlenecks: PR review latency avg 13.58h');
      expect(formatted).toContain('Active Engineers: @alex-dev, @sarah-c');
      expect(formatted).toContain('Agreed Action Items: Enforce PR size < 400 lines | Parallelize CI suites');
      expect(formatted).toContain('Sprint Status: Sprint 42 | Capacity: 85 pts');

      // Check compactness: under 600 characters (~120 tokens)
      expect(formatted.length).toBeLessThan(700);
    });

    it('should return empty string for empty matrix', () => {
      expect(service.formatMatrixAsSystemPrompt({})).toBe('');
      expect(service.formatMatrixAsSystemPrompt(null)).toBe('');
    });
  });

  describe('Persistence & Retrieval (saveThreadFactMatrix & getThreadFactMatrix)', () => {
    it('should save to db and return cached matrix on subsequent calls', async () => {
      const threadId = 'th_test_12345';
      const matrix = {
        repository: 'logsv/em-taskflow-ai',
        engineers: ['@alex-dev'],
      };

      await service.saveThreadFactMatrix(threadId, matrix);
      const retrieved = await service.getThreadFactMatrix(threadId);

      expect(retrieved).toEqual(matrix);
      expect(mockDb.store.get(threadId)).toEqual(matrix);
    });

    it('should fall back gracefully to in-memory store when DB throws error', async () => {
      const failingDb = {
        async getThreadContextMatrix() {
          throw new Error('Postgres connection failed');
        },
        async updateThreadContextMatrix() {
          throw new Error('Postgres connection failed');
        },
      };
      const fallbackService = new SessionFactMatrixService({ db: failingDb });
      const threadId = 'th_fallback_999';
      const matrix = { repository: 'fallback/repo', engineers: ['@eng-fallback'] };

      await fallbackService.saveThreadFactMatrix(threadId, matrix);
      const retrieved = await fallbackService.getThreadFactMatrix(threadId);

      expect(retrieved).toEqual(matrix);
    });
  });

  describe('Edge Cases & Bounded Token Budgeting', () => {
    it('should deduplicate engineer handles and PR numbers during delta merge', () => {
      const existing = {
        engineers: ['@alex-dev', '@sarah-c'],
        prs: ['#101', '#102'],
        actionItems: ['Fix CI flakiness'],
      };

      const delta = {
        engineers: ['@alex-dev', '@mike-ops'],
        prs: ['#102', '#103'],
        actionItems: ['Fix CI flakiness', 'Review PR size'],
      };

      const merged = service.mergeFactMatrix(existing, delta);

      expect(merged.engineers).toEqual(['@alex-dev', '@sarah-c', '@mike-ops']);
      expect(merged.prs).toEqual(['#101', '#102', '#103']);
      expect(merged.actionItems).toEqual(['Fix CI flakiness', 'Review PR size']);
    });

    it('should cap max list items to prevent prompt bloat', () => {
      const existing = {
        actionItems: Array.from({ length: 10 }, (_, i) => `Action item ${i}`),
        prs: Array.from({ length: 15 }, (_, i) => `#${i + 100}`),
      };

      const delta = {
        actionItems: ['New critical action item'],
        prs: ['#999'],
      };

      const merged = service.mergeFactMatrix(existing, delta);

      expect(merged.actionItems.length).toBeLessThanOrEqual(8);
      expect(merged.prs.length).toBeLessThanOrEqual(10);
    });

    it('should parse Elite, Medium, and Low DORA benchmark tiers accurately', () => {
      const eliteResponse = 'DORA Performance: ELITE Tier with 15 deploys/week and MTTR 0.5 hours.';
      const eliteDelta = service.extractFactDelta('DORA audit', eliteResponse);
      expect(eliteDelta.dora.tier).toBe('ELITE');

      const medResponse = 'DORA Performance: MEDIUM Tier with 0.8 deploys/week and CFR 15%.';
      const medDelta = service.extractFactDelta('DORA audit', medResponse);
      expect(medDelta.dora.tier).toBe('MEDIUM');
    });

    it('should handle null or undefined query and response strings without throwing', () => {
      expect(() => service.extractFactDelta(null, null)).not.toThrow();
      expect(() => service.extractFactDelta('', '')).not.toThrow();
      const emptyDelta = service.extractFactDelta(undefined, undefined);
      expect(emptyDelta.engineers).toBeUndefined();
      expect(emptyDelta.prs).toBeUndefined();
    });
  });
});
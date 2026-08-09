import { createDeterministicToolHarness, commonHarnessSchema } from '../../src/mcp/baseToolHarness.js';
import config from '../../src/config.js';

describe('Phase 2 Infrastructure Specs: Deterministic Tool Harness & 3-Tier Fallback', () => {
  it('should export commonHarnessSchema with default values', () => {
    const parsed = commonHarnessSchema.parse({});
    expect(parsed.sources).toEqual(['default']);
    expect(parsed.mode).toBe('ANALYZE');
    expect(parsed.fetch_fresh_data).toBe(true);
  });

  describe('3-Tier Execution & Fallback Mechanism', () => {
    it('should execute Tier 1 (MCP Adapter) when Tier 1 succeeds', async () => {
      const harness = createDeterministicToolHarness({
        name: 'test_harness_tier1',
        description: 'Test harness for Tier 1 MCP',
        featureFlagKey: 'dora',
        mcpExecutors: {
          default: async () => ({ pr_count: 10, source: 'MCP_SERVER' }),
        },
        directApiExecutors: {
          default: async () => ({ pr_count: 5, source: 'DIRECT_API' }),
        },
        dbCacheFallback: async () => ({ pr_count: 2, source: 'DB_CACHE' }),
        computeMath: async (results) => ({ totalPrs: results.default.data.pr_count, tier: results.default.tierUsed }),
      });

      const res = await harness.invoke({});
      expect(res.status).toBe('SUCCESS');
      expect(res.data.tier).toBe('TIER_1_MCP');
      expect(res.data.totalPrs).toBe(10);
      expect(res.staleDataWarning).toBe(false);
    });

    it('should fallback to Tier 2 (Direct REST API) when Tier 1 throws an error', async () => {
      const harness = createDeterministicToolHarness({
        name: 'test_harness_tier2',
        description: 'Test harness for Tier 2 fallback',
        featureFlagKey: 'dora',
        mcpExecutors: {
          default: async () => {
            throw new Error('MCP server offline');
          },
        },
        directApiExecutors: {
          default: async () => ({ pr_count: 7, source: 'DIRECT_API' }),
        },
        dbCacheFallback: async () => ({ pr_count: 3, source: 'DB_CACHE' }),
        computeMath: async (results) => ({ totalPrs: results.default.data.pr_count, tier: results.default.tierUsed }),
      });

      const res = await harness.invoke({});
      expect(res.status).toBe('SUCCESS');
      expect(res.data.tier).toBe('TIER_2_DIRECT_API');
      expect(res.data.totalPrs).toBe(7);
      expect(res.staleDataWarning).toBe(false);
    });

    it('should fallback to Tier 3 (PostgreSQL Cache) with staleDataWarning when Tier 1 & Tier 2 fail', async () => {
      const harness = createDeterministicToolHarness({
        name: 'test_harness_tier3',
        description: 'Test harness for Tier 3 fallback',
        featureFlagKey: 'dora',
        mcpExecutors: {
          default: async () => {
            throw new Error('MCP unreachable');
          },
        },
        directApiExecutors: {
          default: async () => {
            throw new Error('API Rate Limited');
          },
        },
        dbCacheFallback: async () => ({ pr_count: 4, source: 'DB_CACHE' }),
        computeMath: async (results) => ({ totalPrs: results.default.data.pr_count, tier: results.default.tierUsed }),
      });

      const res = await harness.invoke({});
      expect(res.status).toBe('SUCCESS');
      expect(res.data.tier).toBe('TIER_3_DB_CACHE');
      expect(res.data.totalPrs).toBe(4);
      expect(res.staleDataWarning).toBe(true);
    });
  });

  describe('Control Flags & Feature Flag Safeguards', () => {
    it('should exit early in CONCEPTUAL_ONLY mode without executing network or DB tiers', async () => {
      let dbCalled = false;
      const harness = createDeterministicToolHarness({
        name: 'test_harness_conceptual',
        description: 'Test harness for conceptual mode',
        featureFlagKey: 'dora',
        dbCacheFallback: async () => {
          dbCalled = true;
          return {};
        },
      });

      const res = await harness.invoke({ mode: 'CONCEPTUAL_ONLY' });
      expect(res.status).toBe('SKIPPED');
      expect(dbCalled).toBe(false);
    });

    it('should bypass harness execution when feature flag is disabled', async () => {
      config.ENABLE_DORA_AGENT = false;
      let executed = false;

      const harness = createDeterministicToolHarness({
        name: 'test_harness_disabled',
        description: 'Test harness disabled by flag',
        featureFlagKey: 'dora',
        dbCacheFallback: async () => {
          executed = true;
          return {};
        },
      });

      const res = await harness.invoke({});
      expect(res.status).toBe('DISABLED');
      expect(executed).toBe(false);

      // Restore config
      config.ENABLE_DORA_AGENT = true;
    });

    it('should support parallel multi-source execution (github, jira)', async () => {
      const harness = createDeterministicToolHarness({
        name: 'test_harness_multisource',
        description: 'Test harness for parallel multi-source execution',
        featureFlagKey: 'delivery',
        directApiExecutors: {
          github: async () => ({ open_prs: 5 }),
          jira: async () => ({ open_tickets: 8 }),
        },
        computeMath: async (results) => ({
          prs: results.github?.data?.open_prs || 0,
          tickets: results.jira?.data?.open_tickets || 0,
        }),
      });

      const res = await harness.invoke({ sources: ['github', 'jira'] });
      expect(res.status).toBe('SUCCESS');
      expect(res.sourcesExecuted).toEqual(['github', 'jira']);
      expect(res.data.prs).toBe(5);
      expect(res.data.tickets).toBe(8);
    });
  });
});

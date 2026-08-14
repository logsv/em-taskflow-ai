import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import config, { getAgentConfig, getMcpConfig } from '../config.js';
import { info, warn, error } from '../utils/logger.js';

export const commonHarnessSchema = z.object({
  sources: z.array(z.string()).default(['default']),
  mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
  filter: z.enum(['ALL', 'MISSED_DEADLINE', 'WIP_VIOLATION', 'HIGH_PRIORITY']).default('ALL'),
  time_window: z.enum(['7d', '30d', '90d']).default('30d'),
  fetch_fresh_data: z.boolean().default(true),
});

/**
 * Creates a 3-tier deterministic tool harness with feature flag checks and multi-source parallel execution.
 */
export function createDeterministicToolHarness({
  name,
  description,
  schema = commonHarnessSchema,
  featureFlagKey,
  mcpExecutors = {},
  directApiExecutors = {},
  dbCacheFallback = async () => ({}),
  computeMath = async (sourceResults) => sourceResults,
}) {
  return tool(
    async (inputArgs) => {
      const startTime = Date.now();
      const agentConfig = getAgentConfig() || {};
      const mcpConfig = getMcpConfig() || {};

      // 1. Feature Flag Check
      const rootFlagKey = `ENABLE_${featureFlagKey ? featureFlagKey.toUpperCase() : ''}_AGENT`;
      const isAgentEnabled = featureFlagKey
        ? agentConfig[featureFlagKey] !== false && config[rootFlagKey] !== false
        : true;

      if (featureFlagKey && !isAgentEnabled) {
        warn(`Deterministic Harness '${name}' bypassed: Feature flag '${rootFlagKey}' is disabled.`);
        return {
          status: 'DISABLED',
          message: `The '${name}' domain harness is currently disabled by system feature flags.`,
          data: null,
        };
      }

      const sources = Array.isArray(inputArgs.sources) && inputArgs.sources.length > 0 ? inputArgs.sources : ['default'];
      const mode = inputArgs.mode || 'ANALYZE';
      const fetchFreshData = inputArgs.fetch_fresh_data !== false;

      // Fast Exit for Conceptual Queries
      if (mode === 'CONCEPTUAL_ONLY') {
        return {
          status: 'SKIPPED',
          message: 'Conceptual mode requested. Tool execution skipped.',
          data: null,
        };
      }

      const sourceResults = {};
      let staleDataWarning = false;

      // 2. Parallel Multi-Source Execution (Tier 1 -> Tier 2 -> Tier 3)
      await Promise.all(
        sources.map(async (src) => {
          // Remap 'default' source to first available executor key
          const resolvedSrc = (src === 'default' && !mcpExecutors['default'] && !directApiExecutors['default'])
            ? (Object.keys(directApiExecutors)[0] || Object.keys(mcpExecutors)[0] || 'default')
            : src;

          let srcResult = null;
          let tierUsed = 'NONE';

          if (fetchFreshData) {
            // TIER 1: MCP Client Adapter
            if (mcpExecutors[resolvedSrc] && typeof mcpExecutors[resolvedSrc] === 'function') {
              try {
                srcResult = await mcpExecutors[resolvedSrc](inputArgs);
                if (srcResult) tierUsed = 'TIER_1_MCP';
              } catch (err) {
                warn(`Harness '${name}' Tier 1 MCP failed for source '${resolvedSrc}': ${err.message}`);
              }
            }

            // TIER 2: Direct API / Secondary Executor Fallback
            if (!srcResult && directApiExecutors[resolvedSrc] && typeof directApiExecutors[resolvedSrc] === 'function') {
              try {
                srcResult = await directApiExecutors[resolvedSrc](inputArgs);
                if (srcResult) tierUsed = 'TIER_2_DIRECT_API';
              } catch (err) {
                warn(`Harness '${name}' Tier 2 Direct API failed for source '${resolvedSrc}': ${err.message}`);
              }
            }
          }

          // TIER 3: PostgreSQL Database Cache Snapshot Fallback
          if (!srcResult) {
            try {
              srcResult = await dbCacheFallback(resolvedSrc, inputArgs);
              tierUsed = 'TIER_3_DB_CACHE';
              staleDataWarning = true;
            } catch (err) {
              error(`Harness '${name}' Tier 3 DB Cache failed for source '${resolvedSrc}': ${err.message}`);
              srcResult = { error: err.message };
            }
          }

          sourceResults[src] = {
            data: srcResult,
            tierUsed,
          };
        }),
      );

      // 3. Mathematical Computation & Report Preparation
      let finalPayload = {};
      try {
        finalPayload = await computeMath(sourceResults, inputArgs);
      } catch (err) {
        error(`Harness '${name}' computeMath failed: ${err.message}`);
        finalPayload = { rawSources: sourceResults, error: err.message };
      }

      const executionTimeMs = Date.now() - startTime;
      info(`Deterministic Harness '${name}' executed in ${executionTimeMs}ms (Mode: ${mode}, Sources: ${sources.join(',')})`);

      return {
        status: 'SUCCESS',
        name,
        mode,
        staleDataWarning,
        executionTimeMs,
        sourcesExecuted: sources,
        data: finalPayload,
      };
    },
    {
      name,
      description,
      schema,
    },
  );
}

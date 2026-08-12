import { createAgent } from 'langchain';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { okrAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';

export const okrProgressTool = createDeterministicToolHarness({
  name: 'evaluate_okr_progress',
  description: 'Evaluates quarterly engineering Objectives & Key Results (OKRs) and KPI scorecards.',
  featureFlagKey: 'okr',
  schema: z.object({
    sources: z.array(z.enum(['notion', 'default'])).default(['default']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    quarter: z.string().default('Q3'),
    objective_id: z.string().default('all'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  directApiExecutors: {
    notion: async (inputArgs) => ({
      quarter: inputArgs.quarter || 'Q3',
      notion_pages: [
        { title: 'Maintain >95% DORA lead time rating', target: 95, current: 98, status: 'ON_TRACK' },
        { title: 'Reduce PR review latency to <12 hours', target: 12, current: 14.2, status: 'AT_RISK' },
      ],
    }),
    default: async (inputArgs) => {
      const dbRecords = await databaseService.getOkrRecords(inputArgs.quarter);
      if (dbRecords && dbRecords.length > 0) {
        return {
          quarter: inputArgs.quarter,
          key_results: dbRecords.map((r) => ({
            kr: r.key_result,
            target: Number(r.target_value),
            current: Number(r.current_value),
            status: r.status,
          })),
        };
      }
      // Save default initial records
      await databaseService.saveOkrRecord({
        objective: 'Improve deployment reliability',
        key_result: 'Maintain >95% DORA lead time rating',
        target_value: 95,
        current_value: 98,
        status: 'ON_TRACK',
        quarter: inputArgs.quarter || 'Q3',
      });
      return {
        quarter: inputArgs.quarter || 'Q3',
        key_results: [
          { kr: 'Maintain >95% DORA lead time rating', target: 95, current: 98, status: 'ON_TRACK' },
          { kr: 'Reduce PR review latency to <12 hours', target: 12, current: 14.2, status: 'AT_RISK' },
        ],
      };
    },
  },
  dbCacheFallback: async (source, inputArgs) => {
    const records = await databaseService.getOkrRecords(inputArgs.quarter);
    return {
      quarter: inputArgs.quarter || 'Q3',
      key_results: records.map((r) => ({ kr: r.key_result, target: Number(r.target_value), current: Number(r.current_value), status: r.status })),
    };
  },
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data || {};
    const notionData = sourceResults.notion?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';

    const krs = notionData.notion_pages || defaultData.key_results || [
      { kr: 'Maintain >95% DORA lead time rating', target: 95, current: 98, status: 'ON_TRACK' },
    ];

    if (mode === 'LIST_RAW') {
      return {
        mode: 'LIST_RAW',
        quarter: inputArgs.quarter,
        totalKeyResults: krs.length,
        items: krs,
      };
    }

    const onTrackCount = krs.filter((k) => k.status === 'ON_TRACK').length;
    const completionPct = Math.round((onTrackCount / Math.max(1, krs.length)) * 100);
    const pacing = completionPct >= 70 ? 'ON_TRACK' : 'AT_RISK';

    return {
      mode: 'ANALYZE',
      quarter: inputArgs.quarter || 'Q3',
      objective_id: inputArgs.objective_id || 'all',
      overall_completion_pct: completionPct,
      pacing,
      key_results: krs,
      summary: `OKR Progress for ${inputArgs.quarter}: ${completionPct}% completion rate. Pacing is ${pacing}.`,
    };
  },
});

export function createOkrAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [okrProgressTool];

  const agent = createAgent({
    model: llm,
    tools,
    name: options.name || 'okr_agent',
    prompt: okrAgentPromptTemplate,
  });
  return agent.graph;
}

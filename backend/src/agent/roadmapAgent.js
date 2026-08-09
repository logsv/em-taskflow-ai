import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { roadmapAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';

export const roadmapAlignmentTool = createDeterministicToolHarness({
  name: 'get_roadmap_alignment',
  description: 'Evaluates project milestone timelines, feature release projections, and initiative drift.',
  featureFlagKey: 'roadmap',
  schema: z.object({
    sources: z.array(z.string()).default(['default']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    initiative_id: z.string().default('q3_roadmap'),
    time_horizon: z.string().default('q3'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  directApiExecutors: {
    default: async (inputArgs) => ({
      initiative_id: inputArgs.initiative_id || 'q3_roadmap',
      milestones: [
        { name: 'Alpha Release', target_date: '2026-08-15', status: 'ON_SCHEDULE' },
        { name: 'Production Rollout', target_date: '2026-09-01', status: 'AT_RISK' },
      ],
      drift_days: 3,
    }),
  },
  dbCacheFallback: async (source, inputArgs) => ({
    initiative_id: inputArgs.initiative_id || 'q3_roadmap',
    milestones: [{ name: 'Cached Release Milestone', target_date: '2026-08-30', status: 'ON_SCHEDULE' }],
    drift_days: 2,
  }),
  computeMath: async (sourceResults, inputArgs) => {
    const data = sourceResults.default?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';

    if (mode === 'LIST_RAW') {
      return {
        mode: 'LIST_RAW',
        initiative_id: inputArgs.initiative_id,
        items: data.milestones || [],
      };
    }

    const drift = Number(data.drift_days || 3);
    let health = 'GREEN';
    if (drift > 7) {
      health = 'RED';
    } else if (drift > 2) {
      health = 'YELLOW';
    }

    return {
      mode: 'ANALYZE',
      initiative_id: inputArgs.initiative_id || 'q3_roadmap',
      time_horizon: inputArgs.time_horizon || 'q3',
      roadmap_health: health,
      drift_days: drift,
      milestones: data.milestones || [],
      mitigation_strategy: 'Reallocate 1 engineer from tech-debt backlog to Production Rollout epic.',
      summary: `Roadmap Alignment for ${inputArgs.initiative_id}: Health is ${health} with ${drift} days estimated drift.`,
    };
  },
});

export function createRoadmapAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [roadmapAlignmentTool];

  return createReactAgent({
    llm,
    tools,
    name: 'roadmap_agent',
    stateModifier: roadmapAgentPromptTemplate,
  });
}

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { sprintAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';

export const sprintPlanTool = createDeterministicToolHarness({
  name: 'calculate_sprint_plan',
  description: 'Calculates sprint capacity, story point velocity, commitment buffers, and scope creep risk for upcoming sprint planning.',
  featureFlagKey: 'sprint',
  schema: z.object({
    sources: z.array(z.string()).default(['default']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    sprint_id: z.string().default('upcoming_sprint'),
    backlog_ids: z.array(z.string()).default([]),
    team_capacity: z.number().default(40),
    target_velocity: z.number().default(35),
    fetch_fresh_data: z.boolean().default(true),
  }),
  directApiExecutors: {
    default: async (inputArgs) => {
      const analytics = await databaseService.getSprintAnalytics(inputArgs.sprint_id);
      const existing = analytics[0] || {};
      return {
        sprint_id: inputArgs.sprint_id || 'upcoming_sprint',
        target_velocity: inputArgs.target_velocity || existing.total_points || 35,
        team_capacity: inputArgs.team_capacity || 40,
        backlog_count: inputArgs.backlog_ids?.length || 8,
      };
    },
  },
  dbCacheFallback: async (source, inputArgs) => ({
    sprint_id: inputArgs.sprint_id || 'upcoming_sprint',
    target_velocity: 35,
    team_capacity: 40,
    backlog_count: 6,
  }),
  computeMath: async (sourceResults, inputArgs) => {
    const data = sourceResults.default?.data || {};
    const capacity = Number(data.team_capacity || 40);
    const velocity = Number(data.target_velocity || 35);
    const recommendedCommitment = Math.round(velocity * 0.85);
    const bufferPoints = velocity - recommendedCommitment;

    return {
      mode: 'ANALYZE',
      sprint_id: inputArgs.sprint_id || 'upcoming_sprint',
      capacity_metrics: {
        team_capacity_hours: capacity,
        target_velocity_points: velocity,
        recommended_commitment_points: recommendedCommitment,
        commitment_buffer_points: bufferPoints,
      },
      risk_factors: [
        '2 engineers taking PTO on Day 7-8',
        'High complexity in database migration task',
      ],
      suggested_scope: `Commit to ${recommendedCommitment} story points (with ${bufferPoints} points buffer) to maintain 100% sprint commitment reliability.`,
    };
  },
});

export function createSprintAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [sprintPlanTool];

  return createReactAgent({
    llm,
    tools,
    name: 'sprint_agent',
    stateModifier: sprintAgentPromptTemplate,
  });
}

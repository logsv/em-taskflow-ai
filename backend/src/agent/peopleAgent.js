import { createAgent } from 'langchain';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { peopleAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';

export const peopleGrowthTool = createDeterministicToolHarness({
  name: 'analyze_personnel_growth',
  description: 'Analyzes engineer career growth, skill matrices, 1-on-1 agendas, burnout risk indicators, or lists calendar invites.',
  featureFlagKey: 'people',
  schema: z.object({
    sources: z.array(z.enum(['google', 'default'])).default(['default']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    filter: z.enum(['ALL', 'TODAY_EVENTS', 'ONE_ON_ONES']).default('ALL'),
    engineer_id: z.string().default('eng_alex'),
    review_period: z.string().default('current_quarter'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  directApiExecutors: {
    google: async () => ({
      today_events: [
        { summary: '1-on-1: Alex & Manager', start_time: '10:00 AM', attendee: 'eng_alex' },
        { summary: 'Architecture Review Sync', start_time: '2:00 PM', attendee: 'team' },
      ],
    }),
    default: async (inputArgs) => ({
      engineer_id: inputArgs.engineer_id || 'eng_alex',
      weekly_workload_hours: 41.5,
      skill_matrix_gaps: ['System Architecture Design', 'Distributed Caching'],
      promotion_criteria_met_pct: 80,
    }),
  },
  dbCacheFallback: async () => ({
    engineer_id: 'eng_alex',
    weekly_workload_hours: 40.0,
    skill_matrix_gaps: ['Architecture Design'],
    promotion_criteria_met_pct: 75,
    today_events: [{ summary: '1-on-1 with Manager (Cached)', start_time: '10:00 AM' }],
  }),
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data || {};
    const googleData = sourceResults.google?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';

    const events = googleData.today_events || defaultData.today_events || [];

    if (mode === 'LIST_RAW') {
      return {
        mode: 'LIST_RAW',
        filter: inputArgs.filter || 'ALL',
        totalEvents: events.length,
        items: events,
      };
    }

    const workloadHours = Number(defaultData.weekly_workload_hours || 41.5);
    const promotionPct = Number(defaultData.promotion_criteria_met_pct || 80);

    let burnoutRisk = 'LOW';
    if (workloadHours > 50.0) {
      burnoutRisk = 'HIGH';
    } else if (workloadHours > 45.0) {
      burnoutRisk = 'MEDIUM';
    }

    return {
      mode: 'ANALYZE',
      engineer_id: inputArgs.engineer_id || 'eng_alex',
      review_period: inputArgs.review_period || 'current_quarter',
      metrics: {
        burnout_risk_score: burnoutRisk,
        weekly_workload_hours: workloadHours,
        promotion_readiness: `ON_TRACK (${promotionPct}% criteria met)`,
      },
      skill_matrix_gaps: defaultData.skill_matrix_gaps || ['System Architecture Design'],
      one_on_one_agenda: [
        `Review progress on ${defaultData.skill_matrix_gaps?.[0] || 'technical goals'}`,
        'Discuss team workload and upcoming sprint PTO schedule',
        'Review career progression goals for next engineering level',
      ],
      today_schedule: events,
      summary: `Personnel Growth Profile for ${inputArgs.engineer_id}: Burnout risk is ${burnoutRisk} (${workloadHours} hrs/week). Promotion readiness: ${promotionPct}%.`,
    };
  },
});

export function createPeopleAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [peopleGrowthTool];

  const agent = createAgent({
    model: llm,
    tools,
    name: options.name || 'people_agent',
    prompt: peopleAgentPromptTemplate,
  });
  return agent.graph;
}

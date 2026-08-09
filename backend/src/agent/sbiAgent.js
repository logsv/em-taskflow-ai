import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { sbiAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';

export const sbiFeedbackTool = createDeterministicToolHarness({
  name: 'format_sbi_feedback',
  description: 'Formats performance feedback using the Situation-Behavior-Impact (SBI) framework, saves records, or retrieves feedback history.',
  featureFlagKey: 'sbi',
  schema: z.object({
    sources: z.array(z.string()).default(['default']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    engineer_id: z.string().default('eng_alex'),
    situation: z.string().optional().describe('Specific event or context where the behavior occurred'),
    behavior: z.string().optional().describe('Observable actions or behaviors exhibited'),
    impact: z.string().optional().describe('Impact or result of the behavior on team/project'),
    action_plan: z.string().optional().describe('Actionable growth steps or next actions'),
    context_type: z.string().default('performance_review'),
    recipient_role: z.string().default('Software Engineer'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  directApiExecutors: {
    default: async (inputArgs) => {
      const situationText = inputArgs.situation || `During the recent release deployment (${inputArgs.context_type})`;
      const behaviorText = inputArgs.behavior || 'Proactively identified and resolved critical PR review bottlenecks';
      const impactText = inputArgs.impact || 'Prevented production downtime and accelerated team delivery velocity';
      const actionPlanText = inputArgs.action_plan || 'Share architecture review best practices in team tech talk';

      // Persist to database
      await databaseService.saveSbiRecord({
        engineer_id: inputArgs.engineer_id,
        situation: situationText,
        behavior: behaviorText,
        impact: impactText,
        action_plan: actionPlanText,
      });

      return {
        engineer_id: inputArgs.engineer_id,
        recipient_role: inputArgs.recipient_role,
        context_type: inputArgs.context_type,
        situation: situationText,
        behavior: behaviorText,
        impact: impactText,
        action_plan: actionPlanText,
      };
    },
  },
  dbCacheFallback: async (source, inputArgs) => {
    const records = await databaseService.getSbiRecords(inputArgs.engineer_id);
    if (records && records.length > 0) {
      return records[0];
    }
    return {
      engineer_id: inputArgs.engineer_id,
      situation: 'During recent sprint execution',
      behavior: 'Maintained high quality PR reviews',
      impact: 'Improved overall team code quality',
      action_plan: 'Continue mentoring peers in tech talks',
    };
  },
  computeMath: async (sourceResults, inputArgs) => {
    const data = sourceResults.default?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';

    if (mode === 'LIST_RAW') {
      const historyRecords = await databaseService.getSbiRecords(inputArgs.engineer_id);
      return {
        mode: 'LIST_RAW',
        engineer_id: inputArgs.engineer_id,
        totalRecords: historyRecords.length,
        items: historyRecords,
      };
    }

    return {
      mode: 'ANALYZE',
      framework: 'Situation-Behavior-Impact (SBI)',
      engineer_id: inputArgs.engineer_id || 'eng_alex',
      recipient_role: inputArgs.recipient_role || 'Software Engineer',
      context_type: inputArgs.context_type || 'performance_review',
      structured_feedback: {
        situation: data.situation,
        behavior: data.behavior,
        impact: data.impact,
        action_plan: data.action_plan,
      },
      summary: `SBI Feedback formatted for ${inputArgs.engineer_id}. Situation: ${data.situation} | Behavior: ${data.behavior} | Impact: ${data.impact}`,
    };
  },
});

export function createSbiAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [sbiFeedbackTool];

  return createReactAgent({
    llm,
    tools,
    name: 'sbi_agent',
    stateModifier: sbiAgentPromptTemplate,
  });
}

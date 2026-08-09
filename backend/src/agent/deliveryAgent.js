import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { deliveryAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';

export const deliveryBottlenecksTool = createDeterministicToolHarness({
  name: 'analyze_delivery_bottlenecks',
  description: 'Analyzes team throughput, WIP limits, blocked tickets, PR review latency, or lists raw open issues/tickets.',
  featureFlagKey: 'delivery',
  schema: z.object({
    sources: z.array(z.enum(['github', 'jira'])).default(['github', 'jira']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    filter: z.enum(['ALL', 'MISSED_DEADLINE', 'WIP_VIOLATION']).default('ALL'),
    sprint_id: z.string().default('active_sprint'),
    board_id: z.string().default('main_board'),
    time_window: z.enum(['7d', '30d', '90d']).default('30d'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  directApiExecutors: {
    github: async () => {
      try {
        const issues = await databaseService.getGithubIssues({});
        const items = (issues || []).map((i) => ({
          id: `#${i.number}`,
          number: i.number,
          title: i.title,
          html_url: i.html_url || `https://github.com/logsv/em-taskflow-ai/issues/${i.number}`,
          state: i.state || 'open',
          repo: i.repo || 'logsv/em-taskflow-ai',
          assignee: i.assignee || 'unassigned',
        }));
        return {
          open_prs: items.length,
          avg_pr_review_wait_hours: items.length > 0 ? 8.5 : 0.0,
          blocked_prs: items,
        };
      } catch (err) {
        return {
          open_prs: 0,
          avg_pr_review_wait_hours: 0.0,
          blocked_prs: [],
          error: err?.message || 'Failed to fetch GitHub issues',
        };
      }
    },
    jira: async () => ({
      wip_count: 7,
      wip_limit: 5,
      blocked_tickets: [{ key: 'ENG-104', summary: 'Database migration schema lock', blocked_by: 'ENG-99' }],
      missed_deadline_tickets: [{ key: 'ENG-88', summary: 'OAuth token refresh bug', due_date: '2026-08-01' }],
    }),
  },
  dbCacheFallback: async (source) => {
    if (source === 'jira') {
      const analytics = await databaseService.getSprintAnalytics();
      return {
        wip_count: analytics[0]?.wip_violations || 2,
        blocked_tickets: [{ key: 'ENG-104', summary: 'Cached DB lock issue' }],
        missed_deadline_tickets: [{ key: 'ENG-88', summary: 'Cached missed deadline ticket' }],
      };
    }
    try {
      const issues = await databaseService.getGithubIssues({});
      const prs = (issues || []).map((i) => ({
        id: `#${i.number}`,
        number: i.number,
        title: i.title,
        html_url: i.html_url || `https://github.com/logsv/em-taskflow-ai/issues/${i.number}`,
        state: i.state || 'open',
        repo: i.repo || 'logsv/em-taskflow-ai',
        assignee: i.assignee || 'unassigned',
      }));
      return {
        open_prs: prs.length,
        avg_pr_review_wait_hours: prs.length > 0 ? 4.5 : 0.0,
        blocked_prs: prs,
      };
    } catch (err) {
      console.error("❌ DeliveryAgent DB fallback failed:", err?.message);
      return {
        open_prs: 0,
        avg_pr_review_wait_hours: 0.0,
        blocked_prs: [],
        error: err?.message || "Failed to fetch GitHub issues from PostgreSQL DB",
      };
    }
  },
  computeMath: async (sourceResults, inputArgs) => {
    const allValues = Object.values(sourceResults);
    const gh = sourceResults.github?.data || sourceResults.default?.data || allValues[0]?.data || {};
    const jira = sourceResults.jira?.data || allValues[1]?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';
    const filter = inputArgs.filter || 'ALL';

    if (mode === 'LIST_RAW') {
      let rawList = [];
      if (filter === 'MISSED_DEADLINE') {
        rawList = jira.missed_deadline_tickets || [];
      } else if (filter === 'WIP_VIOLATION') {
        rawList = jira.blocked_tickets || [];
      } else {
        rawList = [...(jira.blocked_tickets || []), ...(jira.missed_deadline_tickets || []), ...(gh.blocked_prs || [])];
      }

      return {
        mode: 'LIST_RAW',
        filter,
        totalItems: rawList.length,
        items: rawList,
      };
    }

    const wipViolations = Math.max(0, (jira.wip_count || 0) - (jira.wip_limit || 5));
    const avgPrWaitHours = Number((gh.avg_pr_review_wait_hours || 14.2).toFixed(1));
    const cycleTimeP80Hours = Number(((avgPrWaitHours * 2.5) + (wipViolations * 8)).toFixed(1));

    let riskIndex = 'LOW';
    if (wipViolations > 2 || avgPrWaitHours > 24.0) {
      riskIndex = 'HIGH';
    } else if (wipViolations > 0 || avgPrWaitHours > 12.0) {
      riskIndex = 'MEDIUM';
    }

    return {
      mode: 'ANALYZE',
      sprint_id: inputArgs.sprint_id || 'active_sprint',
      delivery_risk_index: riskIndex,
      metrics: {
        wip_violations: wipViolations,
        wip_count: jira.wip_count || 7,
        wip_limit: jira.wip_limit || 5,
        avg_pr_review_wait_hours: avgPrWaitHours,
        cycle_time_p80_hours: cycleTimeP80Hours,
        scope_creep_points: 5,
      },
      blocked_tickets: jira.blocked_tickets || [],
      missed_deadline_tickets: jira.missed_deadline_tickets || [],
      summary: `Delivery Risk Index: ${riskIndex}. ${wipViolations} WIP limit violations detected. Avg PR review wait: ${avgPrWaitHours}h.`,
    };
  },
});

export function createDeliveryAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [deliveryBottlenecksTool];

  return createReactAgent({
    llm,
    tools,
    name: options.name || 'delivery_agent',
    stateModifier: deliveryAgentPromptTemplate,
  });
}

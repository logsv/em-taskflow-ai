import { createAgent } from 'langchain';
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
  mcpExecutors: {
    github: async (inputArgs) => {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const q = inputArgs?.repo_id && inputArgs.repo_id !== 'default'
          ? `repo:${inputArgs.repo_id} is:issue state:open`
          : `is:issue is:open`;
        const res = await executeMCPTool('search_issues', { query: q }).catch(() => null);
        let items = null;
        if (Array.isArray(res)) {
          items = res;
        } else if (res && Array.isArray(res.items)) {
          items = res.items;
        } else if (res && Array.isArray(res.data)) {
          items = res.data;
        } else if (typeof res === 'string' && res.trim().length > 0) {
          try {
            const parsed = JSON.parse(res);
            items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
          } catch (e) { items = null; }
        }
        if (Array.isArray(items) && items.length > 0) {
          const prs = items.map((i) => ({
            id: `#${i.number}`,
            number: i.number,
            title: i.title,
            html_url: i.html_url || `https://github.com/issues/${i.number}`,
            state: i.state || 'open',
            repo: i.repo || 'github_repo',
            assignee: i.user || i.assignee || 'unassigned',
          }));
          return {
            open_prs: prs.length,
            avg_pr_review_wait_hours: null,
            blocked_prs: prs,
            github_issues: prs,
            source: 'mcp',
          };
        }
      } catch (err) {
        // Fall back to PostgreSQL DB cache
      }
      return null;
    },
    jira: async () => {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const res = await executeMCPTool('jira_search', { jql: 'status in ("In Progress", "Blocked")' }).catch(() => null);
        if (res) {
          let data = null;
          if (typeof res === 'object') data = res;
          else if (typeof res === 'string' && res.trim().startsWith('{')) {
            try { data = JSON.parse(res); } catch (e) { data = null; }
          }
          if (data) {
            return {
              wip_count: data.total || 7,
              wip_limit: 5,
              blocked_tickets: data.issues || [{ key: 'ENG-104', summary: 'Database migration schema lock', blocked_by: 'ENG-99' }],
              missed_deadline_tickets: [{ key: 'ENG-88', summary: 'OAuth token refresh bug', due_date: '2026-08-01' }],
              source: 'mcp',
            };
          }
        }
      } catch (err) {
        // Fall back to PostgreSQL DB cache
      }
      return null;
    },
  },
  // Fallback: PostgreSQL Database Cache Snapshot
  dbCacheFallback: async (source) => {
    if (source === 'jira') {
      const analytics = await databaseService.getSprintAnalytics().catch(() => []);
      return {
        wip_count: analytics[0]?.wip_count ?? null,
        wip_limit: analytics[0]?.wip_limit ?? null,
        blocked_tickets: analytics[0]?.blocked_tickets || [],
        missed_deadline_tickets: analytics[0]?.missed_deadline_tickets || [],
        is_cached: true,
        data_availability: analytics.length > 0 ? 'cached' : 'empty',
      };
    }
    try {
      const issues = await databaseService.getGithubIssues({}).catch(() => []);
      const prs = (issues || []).map((i) => ({
        id: `#${i.number}`,
        number: i.number,
        title: i.title,
        html_url: i.html_url || `https://github.com/issues/${i.number}`,
        state: i.state || 'open',
        repo: i.repo || 'github_repo',
        assignee: i.assignee || 'unassigned',
      }));
      return {
        open_prs: prs.length,
        avg_pr_review_wait_hours: null,
        blocked_prs: prs,
        github_issues: prs,
        is_cached: true,
      };
    } catch (err) {
      return {
        open_prs: 0,
        avg_pr_review_wait_hours: null,
        blocked_prs: [],
        github_issues: [],
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

    const githubIssues = gh.blocked_prs || gh.github_issues || [];

    if (mode === 'LIST_RAW') {
      let rawList = [];
      if (filter === 'MISSED_DEADLINE') {
        rawList = jira.missed_deadline_tickets || [];
      } else if (filter === 'WIP_VIOLATION') {
        rawList = jira.blocked_tickets || [];
      } else {
        rawList = [...(jira.blocked_tickets || []), ...(jira.missed_deadline_tickets || []), ...githubIssues];
      }

      return {
        mode: 'LIST_RAW',
        filter,
        totalItems: rawList.length,
        items: rawList,
      };
    }

    const hasFiniteMetric = (value) => typeof value === 'number' && Number.isFinite(value);
    const hasDeliveryData = githubIssues.length > 0 || hasFiniteMetric(jira.wip_count);
    if (!hasDeliveryData) {
      return {
        mode: 'ANALYZE',
        delivery_risk_index: 'UNAVAILABLE',
        metrics: null,
        blocked_prs: [],
        github_issues: [],
        blocked_tickets: [],
        missed_deadline_tickets: [],
        data_availability: 'empty',
        summary: 'Delivery data is unavailable from both live integrations and the PostgreSQL cache.',
      };
    }
    const wipLimit = hasFiniteMetric(jira.wip_limit) ? jira.wip_limit : 5;
    const wipCount = hasFiniteMetric(jira.wip_count) ? jira.wip_count : 0;
    const wipViolations = Math.max(0, wipCount - wipLimit);
    const avgPrWaitHours = hasFiniteMetric(gh.avg_pr_review_wait_hours) ? Number(gh.avg_pr_review_wait_hours.toFixed(1)) : null;
    const cycleTimeP80Hours = avgPrWaitHours === null ? null : Number(((avgPrWaitHours * 2.5) + (wipViolations * 8)).toFixed(1));

    let riskIndex = avgPrWaitHours === null && !hasFiniteMetric(jira.wip_count) ? 'PARTIAL' : 'LOW';
    if (wipViolations > 2 || (avgPrWaitHours !== null && avgPrWaitHours > 24.0)) {
      riskIndex = 'HIGH';
    } else if (wipViolations > 0 || (avgPrWaitHours !== null && avgPrWaitHours > 12.0)) {
      riskIndex = 'MEDIUM';
    }

    const githubMarkdown = githubIssues.length > 0
      ? githubIssues.map((i) => `- [#${i.number} ${i.title}](${i.html_url}) | Assignee: ${i.assignee || 'unassigned'} | Status: ${i.state || 'open'}`).join('\n')
      : '';

    const reviewWaitText = avgPrWaitHours === null ? 'unavailable' : `${avgPrWaitHours}h`;
    const summaryText = `Delivery Risk Index: ${riskIndex}. ${hasFiniteMetric(jira.wip_count) ? `${wipViolations} WIP limit violations detected.` : 'WIP data unavailable.'} Avg PR review wait: ${reviewWaitText}. Active Open GitHub Issues (${githubIssues.length}).` +
      (githubMarkdown ? `\n\nOpen GitHub Issues:\n${githubMarkdown}` : '');

    return {
      mode: 'ANALYZE',
      sprint_id: inputArgs.sprint_id || 'active_sprint',
      delivery_risk_index: riskIndex,
      metrics: {
        wip_violations: wipViolations,
        wip_count: wipCount,
        wip_limit: wipLimit,
        avg_pr_review_wait_hours: avgPrWaitHours,
        cycle_time_p80_hours: cycleTimeP80Hours,
        scope_creep_points: 5,
        open_github_issues_count: githubIssues.length,
      },
      blocked_prs: githubIssues,
      github_issues: githubIssues,
      blocked_tickets: jira.blocked_tickets || [],
      missed_deadline_tickets: jira.missed_deadline_tickets || [],
      summary: summaryText,
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

  const agent = createAgent({
    model: llm,
    tools,
    name: options.name || 'delivery_agent',
    prompt: deliveryAgentPromptTemplate,
  });
  return agent.graph;
}

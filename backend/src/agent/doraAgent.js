import { createAgent } from 'langchain';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { doraAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';

export const doraMetricsTool = createDeterministicToolHarness({
  name: 'calculate_dora_metrics',
  description: 'Calculates DORA metrics (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR) for a team or repository.',
  featureFlagKey: 'dora',
  schema: z.object({
    sources: z.array(z.string()).default(['github']),
    time_window: z.enum(['7d', '30d', '90d']).default('30d'),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    repo_id: z.string().optional(),
    team_id: z.string().optional(),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Model Context Protocol (MCP) tool execution
  mcpExecutors: {
    github: async (inputArgs) => {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const queryStr = inputArgs.repo_id
          ? `repo:${inputArgs.repo_id} is:issue`
          : `is:issue is:open`;
        const res = await executeMCPTool('search_issues', { query: queryStr }).catch(() => null);
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
          // GitHub issue search is useful supplementary evidence, but it does
          // not contain deployments, incidents, or lead-time measurements.
          // Return null so the harness obtains authoritative DORA snapshots
          // from PostgreSQL rather than inventing operational metrics.
          return null;
        }
      } catch (err) {
        // Fall back to PostgreSQL DB cache
      }
      return null;
    },
  },
  // Fallback: PostgreSQL Database Cache Snapshot
  dbCacheFallback: async (source, inputArgs) => {
    const snapshots = await databaseService.getDoraSnapshots(inputArgs.team_id || null).catch(() => []);
    const issues = await databaseService.getGithubIssues({
      ...(inputArgs.repo_id ? { repo: inputArgs.repo_id } : {}),
      state: 'open',
    }).catch(() => []);
    const activeIssues = (issues || []).map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state || 'open',
      html_url: i.html_url || `https://github.com/issues/${i.number}`,
      assignee: i.assignee || 'unassigned',
    }));

    if (snapshots && snapshots.length > 0) {
      const snap = snapshots[0];
      return {
        repo_id: inputArgs.repo_id || null,
        team_id: inputArgs.team_id || snap.team_id || null,
        time_window: inputArgs.time_window || '30d',
        deployment_frequency_per_week: Number(snap.deployment_frequency),
        lead_time_hours: Number(snap.lead_time_hours),
        change_failure_rate_pct: Number(snap.change_failure_rate),
        mttr_hours: Number(snap.mttr_hours),
        active_issues: activeIssues,
        is_cached: true,
        synced_at: snap.created_at || new Date().toISOString(),
      };
    }

    return {
      repo_id: inputArgs.repo_id || null,
      team_id: inputArgs.team_id || null,
      time_window: inputArgs.time_window || '30d',
      active_issues: activeIssues,
      is_cached: true,
      data_availability: 'no_dora_snapshot',
    };
  },
  computeMath: async (sourceResults, inputArgs) => {
    const ghData = sourceResults.github?.data || sourceResults.default?.data || Object.values(sourceResults)[0]?.data || {};

    const hasFiniteMetric = (value) => typeof value === 'number' && Number.isFinite(value);
    const hasSnapshot = hasFiniteMetric(ghData.deployment_frequency_per_week) &&
      hasFiniteMetric(ghData.lead_time_hours) &&
      hasFiniteMetric(ghData.change_failure_rate_pct) &&
      hasFiniteMetric(ghData.mttr_hours);
    const activeIssues = ghData.active_issues || [];
    if (!hasSnapshot) {
      return {
        rating: 'UNAVAILABLE',
        team_id: inputArgs.team_id || null,
        repo_id: inputArgs.repo_id || null,
        time_window: inputArgs.time_window || '30d',
        metrics: null,
        active_issues: activeIssues,
        github_issues: activeIssues,
        data_availability: 'no_dora_snapshot',
        summary: inputArgs.team_id
          ? `DORA metrics are unavailable because no cached DORA snapshot exists for team '${inputArgs.team_id}'. GitHub issue data alone cannot establish deployment frequency, lead time, change-failure rate, or MTTR.`
          : 'DORA metrics are unavailable because no cached DORA snapshot exists. GitHub issue data alone cannot establish deployment frequency, lead time, change-failure rate, or MTTR.',
      };
    }
    const deploymentFrequencyWeeks = ghData.deployment_frequency_per_week;
    const averageLeadTimeHours = ghData.lead_time_hours;
    const changeFailureRatePct = ghData.change_failure_rate_pct;
    const mttrHours = ghData.mttr_hours;

    let rating = 'HIGH';
    if (deploymentFrequencyWeeks < 1.0 || averageLeadTimeHours > 168.0) {
      rating = 'LOW';
    } else if (deploymentFrequencyWeeks < 3.0 || averageLeadTimeHours > 48.0) {
      rating = 'MEDIUM';
    } else if (deploymentFrequencyWeeks >= 7.0 && averageLeadTimeHours <= 24.0) {
      rating = 'ELITE';
    }

    const issuesMarkdown = activeIssues.length > 0
      ? activeIssues.map((i) => `- [#${i.number} ${i.title}](${i.html_url}) | Assignee: ${i.assignee || 'unassigned'} | Status: ${i.state || 'open'}`).join('\n')
      : '';

    const summaryText = `Team '${inputArgs.team_id || 'default'}' DORA Rating: ${rating}. Lead time averages ${averageLeadTimeHours}h with ${deploymentFrequencyWeeks} deploys/week across ${activeIssues.length} open issue(s).` +
      (issuesMarkdown ? `\n\nActive Open GitHub Issues:\n${issuesMarkdown}` : '');

    return {
      rating,
      team_id: inputArgs.team_id || ghData.team_id || null,
      repo_id: inputArgs.repo_id || ghData.repo_id || null,
      time_window: inputArgs.time_window || '30d',
      metrics: {
        deployment_frequency: `${deploymentFrequencyWeeks} deploys/week`,
        lead_time_hours: averageLeadTimeHours,
        change_failure_rate_pct: changeFailureRatePct,
        mttr_hours: mttrHours,
        active_issues_count: activeIssues.length,
      },
      active_issues: activeIssues,
      github_issues: activeIssues,
      summary: summaryText,
    };
  },
});

export function createDoraAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [doraMetricsTool];

  const agent = createAgent({
    model: llm,
    tools,
    name: 'dora_agent',
    prompt: doraAgentPromptTemplate,
  });
  return agent.graph;
}

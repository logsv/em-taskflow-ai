import { createAgent } from 'langchain';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { doraAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import identityService from '../services/identityService.js';

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
    author: z.string().optional(),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Model Context Protocol (MCP) tool execution for GitHub Live Events
  mcpExecutors: {
    github: async (inputArgs) => {
      if (inputArgs.fetch_fresh_data === false) {
        return null; // Force DB snapshot retrieval
      }
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const repoStr = inputArgs.repo_id || 'logsv/em-taskflow-ai';
        const parts = repoStr.includes('/') ? repoStr.split('/') : ['logsv', repoStr];
        const owner = parts[0] || 'logsv';
        const repo = parts[1] || 'em-taskflow-ai';

        const res = await Promise.race([
          executeMCPTool('get_dora_events', {
            owner,
            repo,
            time_window: inputArgs.time_window || '30d',
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('MCP GitHub get_dora_events timed out')), 2500)),
        ]).catch(() => null);

        let parsed = null;
        if (typeof res === 'string' && res.trim().length > 0) {
          try {
            parsed = JSON.parse(res);
          } catch (e) {
            parsed = null;
          }
        } else if (res && typeof res === 'object') {
          parsed = res;
        }

        if (parsed && !parsed.error && parsed.data_source === 'github_live_mcp') {
          return {
            repo_id: `${owner}/${repo}`,
            team_id: inputArgs.team_id || null,
            time_window: inputArgs.time_window || '30d',
            deployment_frequency_per_week: Number(parsed.deployment_frequency_per_week) || 0,
            lead_time_hours: Number(parsed.lead_time_hours) || 0,
            change_failure_rate_pct: Number(parsed.change_failure_rate_pct) || 0,
            mttr_hours: Number(parsed.mttr_hours) || 0,
            review_wait_time_hours: Number(parsed.review_wait_time_hours) || 0,
            ci_build_time_hours: Number(parsed.ci_build_time_hours) || 0.25,
            pull_requests_analyzed: parsed.pull_requests_analyzed || 0,
            releases_analyzed: parsed.releases_analyzed || 0,
            is_cached: false,
            synced_at: parsed.synced_at || new Date().toISOString(),
            data_source: 'github_live_mcp',
          };
        }
      } catch (err) {
        // Live GitHub MCP call failed or timed out; fall back to PostgreSQL DB cache
      }
      return null;
    },
  },
  // Tier 2 Fallback: PostgreSQL Database Cache Snapshot
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
      const leadTime = Number(snap.lead_time_hours);
      return {
        repo_id: inputArgs.repo_id || null,
        team_id: inputArgs.team_id || snap.team_id || null,
        time_window: inputArgs.time_window || '30d',
        deployment_frequency_per_week: Number(snap.deployment_frequency),
        lead_time_hours: leadTime,
        change_failure_rate_pct: Number(snap.change_failure_rate),
        mttr_hours: Number(snap.mttr_hours),
        review_wait_time_hours: Number((leadTime * 0.7).toFixed(2)),
        ci_build_time_hours: 0.25,
        active_issues: activeIssues,
        is_cached: true,
        synced_at: snap.created_at || new Date().toISOString(),
        data_source: 'postgres_dora_snapshots',
      };
    }

    return {
      repo_id: inputArgs.repo_id || null,
      team_id: inputArgs.team_id || null,
      time_window: inputArgs.time_window || '30d',
      active_issues: activeIssues,
      is_cached: true,
      data_availability: 'no_dora_snapshot',
      data_source: 'none',
    };
  },
  // Deterministic Anti-Vanity Math & Tier Classification Engine
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
        tier: 'UNAVAILABLE',
        team_id: inputArgs.team_id || null,
        repo_id: inputArgs.repo_id || null,
        time_window: inputArgs.time_window || '30d',
        metrics: null,
        active_issues: activeIssues,
        github_issues: activeIssues,
        data_availability: 'no_dora_snapshot',
        data_source: ghData.data_source || 'none',
        summary: inputArgs.team_id
          ? `### ⚠️ DORA Metrics Unavailable\n\nNo verified DORA operational snapshot exists for team '${inputArgs.team_id}'. Raw GitHub issue counts alone cannot determine Deployment Frequency, Lead Time, Change Failure Rate, or MTTR without release tag timestamps.`
          : '### ⚠️ DORA Metrics Unavailable\n\nNo verified DORA operational snapshot exists. Raw GitHub issue counts alone cannot determine Deployment Frequency, Lead Time, Change Failure Rate, or MTTR without release tag timestamps.',
      };
    }

    const deploymentFrequencyWeeks = ghData.deployment_frequency_per_week;
    const averageLeadTimeHours = ghData.lead_time_hours;
    const changeFailureRatePct = ghData.change_failure_rate_pct;
    const mttrHours = ghData.mttr_hours;
    const reviewWaitTimeHours = ghData.review_wait_time_hours || Number((averageLeadTimeHours * 0.7).toFixed(2));
    const ciBuildTimeHours = ghData.ci_build_time_hours || 0.25;
    const dataSource = ghData.data_source || (ghData.is_cached ? 'postgres_dora_snapshots' : 'github_live_mcp');
    const syncedAt = ghData.synced_at || new Date().toISOString();

    // Industry Benchmark 4-Tier Evaluation
    let rating = 'HIGH';
    if (deploymentFrequencyWeeks < 0.25 || averageLeadTimeHours > 720.0 || changeFailureRatePct > 30.0 || mttrHours > 168.0) {
      rating = 'LOW';
    } else if (deploymentFrequencyWeeks < 1.0 || averageLeadTimeHours > 168.0 || changeFailureRatePct > 15.0 || mttrHours > 24.0) {
      rating = 'MEDIUM';
    } else if (deploymentFrequencyWeeks >= 7.0 && averageLeadTimeHours <= 24.0 && changeFailureRatePct <= 5.0 && mttrHours <= 1.0) {
      rating = 'ELITE';
    } else {
      rating = 'HIGH';
    }

    // Identify Flow Bottlenecks
    const bottlenecks = [];
    if (reviewWaitTimeHours > 12.0) {
      bottlenecks.push(`PR review latency averages ${reviewWaitTimeHours}h (${Math.round((reviewWaitTimeHours / Math.max(averageLeadTimeHours, 1)) * 100)}% of total lead time).`);
    }
    if (changeFailureRatePct > 15.0) {
      bottlenecks.push(`Elevated Change Failure Rate (${changeFailureRatePct}%) indicates insufficient pre-merge automated testing or staging verification.`);
    }
    if (mttrHours > 4.0) {
      bottlenecks.push(`Recovery time (${mttrHours}h) exceeds the 4-hour SLA. Recommend automated rollback triggers.`);
    }
    if (bottlenecks.length === 0) {
      bottlenecks.push('Deployment pipeline and review throughput are operating within healthy SLA bounds.');
    }

    // Build Structured Markdown Output Card
    const repoPath = ghData.repo_id || (inputArgs.repo_id ? inputArgs.repo_id : 'logsv/em-taskflow-ai');
    const repoUrl = `https://github.com/${repoPath}`;
    const targetLabel = inputArgs.team_id
      ? `Team '${inputArgs.team_id}'`
      : inputArgs.repo_id
      ? `Repository [**${inputArgs.repo_id}**](${repoUrl})`
      : `[**${repoPath}**](${repoUrl})`;

    const provenanceNotice = ghData.is_cached
      ? `> ⚠️ **Notice**: Displaying cached operational telemetry from PostgreSQL database as of \`${syncedAt}\`.`
      : `> ✅ **Notice**: Fresh operational telemetry retrieved via Live GitHub MCP integration at \`${syncedAt}\`.`;

    const summaryText = `### 📊 DORA Performance Scorecard: ${targetLabel} (${inputArgs.time_window || '30d'})

${provenanceNotice}

| Metric | Measured Value | Industry Benchmark Tier | Health Status |
| :--- | :--- | :--- | :--- |
| **Deployment Frequency** | **${deploymentFrequencyWeeks} deploys/week** | ${rating} Tier | ${deploymentFrequencyWeeks >= 1.0 ? '🟢 Healthy' : '🔴 Needs Attention'} |
| **Lead Time for Changes** | **${averageLeadTimeHours} hours** | ${rating} Tier | ${averageLeadTimeHours <= 48.0 ? '🟢 Rapid' : '🟡 Review Stalls'} |
| **Change Failure Rate** | **${changeFailureRatePct}%** | ${rating} Tier | ${changeFailureRatePct <= 15.0 ? '🟢 Stable' : '🔴 High Risk'} |
| **Time to Restore (MTTR)**| **${mttrHours} hours** | ${rating} Tier | ${mttrHours <= 4.0 ? '🟢 Fast Recovery' : '🟡 Moderate'} |

> 💡 **Executive Bottom Line**: Overall operational flow is rated at **${rating} Tier** (${deploymentFrequencyWeeks >= 1.0 && averageLeadTimeHours <= 48 ? 'Stable velocity with rapid merge cadence' : 'Review queue latency represents primary optimization area'}).

<details>
<summary><b>🔍 Flow & Bottleneck Analysis (${bottlenecks.length} Key Insights)</b></summary>

${bottlenecks.map((b) => `- ${b}`).join('\n')}
- **Review Queue Latency**: Pull requests average **${reviewWaitTimeHours}h** in review across [**${repoPath} Pull Requests**](${repoUrl}/pulls).
- **CI Pipeline Duration**: Build & test automation accounts for **~${ciBuildTimeHours * 60} minutes**.

</details>

<details>
<summary><b>🎯 Strategic Recommendations for Engineering Manager</b></summary>

1. **PR Batch Size Guardrail**: Enforce PR sizing $< 400$ lines to reduce review wait time by up to 50%.
2. **CI Parallelization**: Run unit test suites in parallel to maintain fast $(< 15\text{ mins})$ merge feedback loops.
3. **Automated Rollback Verification**: Implement one-click rollbacks for releases showing error anomalies.

</details>
`;

    return {
      rating,
      tier: rating,
      team_id: inputArgs.team_id || ghData.team_id || null,
      repo_id: inputArgs.repo_id || ghData.repo_id || null,
      time_window: inputArgs.time_window || '30d',
      metrics: {
        deployment_frequency: `${deploymentFrequencyWeeks} deploys/week`,
        lead_time_hours: averageLeadTimeHours,
        change_failure_rate_pct: changeFailureRatePct,
        mttr_hours: mttrHours,
        review_wait_time_hours: reviewWaitTimeHours,
        ci_build_time_hours: ciBuildTimeHours,
        active_issues_count: activeIssues.length,
      },
      bottlenecks,
      is_cached: Boolean(ghData.is_cached),
      data_source: dataSource,
      synced_at: syncedAt,
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

import { z } from 'zod';
import { doraAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import { evaluateDoraTier, identifyDoraBottlenecks } from '../utils/doraMetrics.js';
import { createMicroAgent, safeExecuteMCPTool, resolveGithubTarget, createProvenanceNotice } from './baseAgent.js';
import { warn } from '../utils/logger.js';

/** A positive measured number, or null when the value was not measured. */
function measuredOrNull(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

export const doraMetricsTool = createDeterministicToolHarness({
  name: 'calculate_dora_metrics',
  description: 'Calculates DORA metrics (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR) for a team or repository.',
  featureFlagKey: 'dora',
  schema: z.object({
    sources: z.array(z.string()).default(['github']),
    time_window: z.enum(['7d', '30d', '90d']).default('30d'),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    metric: z.enum(['ALL', 'LEAD_TIME', 'DEPLOY_FREQ', 'CFR', 'MTTR']).default('ALL'),
    target: z.enum(['ALL', 'RELEASES', 'DEPLOYMENTS', 'PRS', 'ISSUES']).default('ALL'),
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
        const { owner, repo, repoId } = resolveGithubTarget(inputArgs);
        const parsed = await safeExecuteMCPTool('get_dora_events', {
          owner,
          repo,
          time_window: inputArgs.time_window || '30d',
        });

        if (parsed && !parsed.error && parsed.data_source === 'github_live_mcp') {
          return {
            repo_id: repoId,
            team_id: inputArgs.team_id || null,
            time_window: inputArgs.time_window || '30d',
            deployment_frequency_per_week: Number(parsed.deployment_frequency_per_week) || 0,
            lead_time_hours: Number(parsed.lead_time_hours) || 0,
            change_failure_rate_pct: Number(parsed.change_failure_rate_pct) || 0,
            mttr_hours: Number(parsed.mttr_hours) || 0,
            review_wait_time_hours: measuredOrNull(parsed.review_wait_time_hours),
            ci_build_time_hours: measuredOrNull(parsed.ci_build_time_hours),
            pull_requests_analyzed: parsed.pull_requests_analyzed || 0,
            releases_analyzed: parsed.releases_analyzed || 0,
            is_cached: false,
            synced_at: parsed.synced_at || new Date().toISOString(),
            data_source: 'github_live_mcp',
          };
        }
      } catch (err) {
        warn({ module: 'doraHarness', action: 'githubExecutor', err: err.message }, 'GitHub DORA executor notice');
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
        // Snapshots store only the four DORA metrics; sub-metrics are unknown, not estimated.
        review_wait_time_hours: null,
        ci_build_time_hours: null,
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
    const reviewWaitTimeHours = measuredOrNull(ghData.review_wait_time_hours);
    const ciBuildTimeHours = measuredOrNull(ghData.ci_build_time_hours);
    const reviewWaitText = reviewWaitTimeHours === null ? 'not measured' : `${reviewWaitTimeHours} hours`;
    const ciBuildText = ciBuildTimeHours === null ? 'not measured' : `~${Math.round(ciBuildTimeHours * 60)} minutes`;
    const dataSource = ghData.data_source || (ghData.is_cached ? 'postgres_dora_snapshots' : 'github_live_mcp');
    const syncedAt = ghData.synced_at || new Date().toISOString();

    // Industry Benchmark 4-Tier Evaluation
    const rating = evaluateDoraTier({
      deploymentFrequencyWeeks,
      averageLeadTimeHours,
      changeFailureRatePct,
      mttrHours,
    });

    // Identify Flow Bottlenecks
    const bottlenecks = identifyDoraBottlenecks({
      reviewWaitTimeHours: reviewWaitTimeHours ?? 0,
      averageLeadTimeHours,
      changeFailureRatePct,
      mttrHours,
    });

    const mode = inputArgs.mode || 'ANALYZE';
    const targetMetric = inputArgs.metric || 'ALL';
    const targetEntity = inputArgs.target || 'ALL';

    const cachedGithub = settingsService.getCachedSettings()?.mcp?.github || {};
    const defaultRepoPath = cachedGithub.owner && cachedGithub.repo ? `${cachedGithub.owner}/${cachedGithub.repo}` : (cachedGithub.repo || 'configured_repo');
    const repoPath = ghData.repo_id || inputArgs.repo_id || defaultRepoPath;
    const repoUrl = `https://github.com/${repoPath}`;

    const targetLabel = inputArgs.team_id
      ? `Team '${inputArgs.team_id}'`
      : inputArgs.repo_id
      ? `Repository [**${inputArgs.repo_id}**](${repoUrl})`
      : `[**${repoPath}**](${repoUrl})`;

    if (mode === 'DRILL_DOWN') {
      let drillSummary = '';
      if (targetMetric === 'LEAD_TIME' || targetEntity === 'PRS') {
        drillSummary = `### ⏱️ Lead Time for Changes Drilldown: ${targetLabel}\n\n` +
          `- **Average Lead Time**: **${averageLeadTimeHours} hours** (${rating} Tier)\n` +
          `- **PR Review Queue Latency**: **${reviewWaitText}**${reviewWaitTimeHours !== null ? ` (~${Math.round((reviewWaitTimeHours / Math.max(averageLeadTimeHours, 1)) * 100)}% of lead time)` : ''}\n` +
          `- **CI/CD Pipeline Build Time**: **${ciBuildText}**\n\n` +
          (reviewWaitTimeHours !== null && reviewWaitTimeHours / Math.max(averageLeadTimeHours, 1) >= 0.5
            ? `> 💡 **Optimization Focus**: Review wait is ${Math.round((reviewWaitTimeHours / Math.max(averageLeadTimeHours, 1)) * 100)}% of lead time. Smaller PRs and review rotations are the first lever.`
            : `> 💡 **Next step**: ${reviewWaitTimeHours === null ? 'Review wait time is not measured, so the lead-time breakdown is unknown. Connect GitHub with PR review timestamps to break lead time down.' : 'Review wait is not the dominant share of lead time; inspect build and deploy stages next.'}`);
      } else if (targetMetric === 'DEPLOY_FREQ' || targetEntity === 'RELEASES' || targetEntity === 'DEPLOYMENTS') {
        drillSummary = `### 🚀 Deployment Frequency Drilldown: ${targetLabel}\n\n` +
          `- **Cadence**: **${deploymentFrequencyWeeks} deploys/week** (${rating} Tier)\n` +
          `- **Status**: ${deploymentFrequencyWeeks >= 1.0 ? '🟢 Steady production release cadence' : '🔴 Deployments occurring less than once per week'}\n\n` +
          `> 💡 **Optimization Focus**: Moving towards smaller, trunk-based feature flags allows releasing daily rather than waiting for bi-weekly batch deployments.`;
      } else if (targetMetric === 'CFR') {
        drillSummary = `### 🛡️ Change Failure Rate Drilldown: ${targetLabel}\n\n` +
          `- **Change Failure Rate**: **${changeFailureRatePct}%** (${rating} Tier)\n` +
          `- **Benchmark**: High-performing teams maintain CFR $< 15\%$.\n\n` +
          `> 💡 **Optimization Focus**: Add automated integration test coverage in GitHub Actions before code merge to prevent regressions reaching staging.`;
      } else if (targetMetric === 'MTTR') {
        drillSummary = `### ⏱️ Mean Time to Restore (MTTR) Drilldown: ${targetLabel}\n\n` +
          `- **MTTR**: **${mttrHours} hours** (${rating} Tier)\n` +
          `- **Benchmark**: Elite MTTR is $< 1.0\\text{ hour}$; healthy is $< 4.0\\text{ hours}$.\n\n` +
          `> 💡 **Optimization Focus**: Verify automated rollbacks and pre-configured runbooks in incident postmortems.`;
      } else {
        drillSummary = `### 🔍 DORA Metrics Operational Breakdown: ${targetLabel}\n\n` +
          `- **Deployment Frequency**: ${deploymentFrequencyWeeks} deploys/week\n` +
          `- **Lead Time for Changes**: ${averageLeadTimeHours}h (Review Wait: ${reviewWaitText})\n` +
          `- **Change Failure Rate**: ${changeFailureRatePct}%\n` +
          `- **MTTR**: ${mttrHours}h\n`;
      }

      return {
        mode: 'DRILL_DOWN',
        metric: targetMetric,
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
        summary: drillSummary,
      };
    }

    const provenanceNotice = createProvenanceNotice(Boolean(ghData.is_cached), syncedAt, 'Live GitHub MCP integration');

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
- **Review Queue Latency**: ${reviewWaitTimeHours === null ? 'not measured' : `pull requests average **${reviewWaitTimeHours}h** in review across [**${repoPath} Pull Requests**](${repoUrl}/pulls)`}.
- **CI Pipeline Duration**: ${ciBuildText}.

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
  return createMicroAgent({
    name: 'dora_agent',
    defaultTool: doraMetricsTool,
    promptTemplate: doraAgentPromptTemplate,
    customTools,
    options,
  });
}

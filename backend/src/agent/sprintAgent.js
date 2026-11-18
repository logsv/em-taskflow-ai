import { z } from 'zod';
import { sprintAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import identityService from '../services/identityService.js';
import settingsService from '../services/settingsService.js';
import { info, warn, error } from '../utils/logger.js';
import { getDirectOrFormattedJiraUrl, formatMarkdownLinkOrCode } from '../utils/urlHelper.js';
import { createMicroAgent, safeExecuteMCPTool, createProvenanceNotice } from './baseAgent.js';

/** Real completed (or committed) points per past sprint; sprints without numbers are skipped, never defaulted. */
function extractVelocities(pastSprints) {
  return pastSprints
    .map((s) => Number(s.completed_points ?? s.total_points))
    .filter((v) => Number.isFinite(v) && v > 0);
}

export const sprintPlanTool = createDeterministicToolHarness({
  name: 'calculate_sprint_plan',
  description: 'Calculates sprint capacity, rolling 5-sprint velocity, 70/20/10 capacity budget allocation, developer concentration risk, and candidate backlog commitment.',
  featureFlagKey: 'sprint',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'jira', 'googleCalendar', 'notion']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    sprint_id: z.string().default('upcoming_sprint'),
    sprint_name: z.string().default('Sprint 43'),
    sprint_duration_days: z.number().default(10),
    team_members: z.array(z.string()).default([]),
    custom_tech_debt_percentage: z.number().default(20),
    unplanned_buffer_percentage: z.number().default(10),
    target_velocity: z.number().optional(),
    team_capacity: z.number().optional(),
    backlog_ids: z.array(z.string()).default([]),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Live MCP & Multi-Source Executors
  mcpExecutors: {
    jira: async (inputArgs) => {
      try {
        const jql = 'status in ("To Do", "Ready for Sprint", "Backlog") AND (sprint is null OR sprint in openSprints()) ORDER BY priority DESC';
        const res = await safeExecuteMCPTool('jira_search', { jql });
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);

        if (issues.length > 0) {
          const candidateTickets = issues.slice(0, 8).map((iss) => {
            // Unestimated tickets stay null; never synthesize an estimate.
            const points = iss.story_points ?? iss.fields?.customfield_10016 ?? iss.fields?.story_points ?? null;
            return {
              key: iss.key,
              summary: iss.summary || iss.fields?.summary || 'Candidate backlog feature',
              story_points: points,
              assignee: iss.assignee || iss.fields?.assignee?.displayName || 'Unassigned',
              is_tech_debt: /tech|debt|refactor|migration|perf|cleanup|ci|cd/i.test(iss.summary || iss.fields?.summary || ''),
            };
          });

          return {
            total_candidate_issues: issues.length,
            candidate_tickets: candidateTickets,
            source: 'mcp_jira',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'sprintHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    googleCalendar: async (_inputArgs) => {
      try {
        const res = await safeExecuteMCPTool('get_calendar_events', { time_window: '14d', max_results: 20 });
        const events = Array.isArray(res) ? res : [];
        const ptoEvents = events.filter((e) => /pto|ooo|vacation|leave|holiday/i.test(e.summary || ''));
        const ptoDays = Math.max(0, ptoEvents.length);

        return {
          total_events: events.length,
          pto_events_count: ptoEvents.length,
          pto_days_detected: ptoDays,
          source: 'mcp_google_calendar',
          synced_at: new Date().toISOString(),
        };
      } catch (err) {
        warn({ module: 'sprintHarness', action: 'calendarExecutor', err: err.message }, 'Calendar executor notice');
      }
      return null;
    },
    notion: async (_inputArgs) => {
      try {
        const res = await safeExecuteMCPTool('notion_search', { query: 'sprint goals working agreements' });

        if (res) {
          return {
            working_agreements_found: true,
            // The Notion page content is not parsed into structured values, so none are reported.
            working_agreements: null,
            source: 'mcp_notion',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'sprintHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const members = await identityService.getTeamMembers().catch(() => []);
      const analytics = await databaseService.getSprintAnalytics().catch(() => []);
      const pastSprints = analytics.slice(0, 5);

      const velocities = extractVelocities(pastSprints);
      const avgVelocity = velocities.length > 0
        ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
        : null;

      return {
        sprint_id: inputArgs.sprint_id || 'upcoming_sprint',
        sprint_name: inputArgs.sprint_name || 'Sprint 43',
        team_size: members.length,
        team_members: members.map((m) => m.displayName),
        historical_velocities: velocities,
        rolling_avg_velocity: avgVelocity,
        candidate_tickets: analytics[0]?.candidate_tickets || [],
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 2: PostgreSQL Database Snapshot Fallback
  dbCacheFallback: async (source, inputArgs = {}) => {
    try {
      const members = await databaseService.getTeamMembers().catch(() => []);
      const analytics = await databaseService.getSprintAnalytics().catch(() => []);
      const pastSprints = analytics.slice(0, 5);
      const velocities = extractVelocities(pastSprints);
      const avgVelocity = velocities.length > 0
        ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
        : null;

      const teamSize = members.length;
      const grossHours = teamSize * 10 * 8 * 0.75; // 10 days * 8h * 75% focus

      return {
        sprint_id: inputArgs?.sprint_id || 'upcoming_sprint',
        sprint_name: inputArgs?.sprint_name || 'Sprint 43',
        team_size: teamSize,
        team_members: members.map((m) => m.displayName),
        gross_capacity_hours: grossHours,
        net_capacity_hours: grossHours, // PTO unknown without a live calendar source
        rolling_avg_velocity: avgVelocity,
        historical_velocities: velocities,
        candidate_tickets: analytics[0]?.candidate_tickets || [],
        pto_days_detected: null,
        is_cached: true,
        data_source: 'postgres_sprint_analytics',
        synced_at: new Date().toISOString(),
      };
    } catch (_e) {
      return {
        sprint_id: inputArgs?.sprint_id || 'upcoming_sprint',
        sprint_name: inputArgs?.sprint_name || null,
        team_size: 0,
        team_members: [],
        gross_capacity_hours: 0,
        net_capacity_hours: 0,
        rolling_avg_velocity: 0,
        historical_velocities: [],
        pto_days_detected: 0,
        is_cached: true,
        data_source: 'empty',
        data_availability: 'no_data',
      };
    }
  },
  // Tier 3: Compute Math & Capacity Budget Allocation Engine
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data || {};
    const jiraData = sourceResults.jira?.data || {};
    const dbFallbackData = sourceResults.dbCacheFallback?.data || {};
    const gcalData = sourceResults.googleCalendar?.data || {};
    const notionData = sourceResults.notion?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';

    const sprintName = inputArgs.sprint_name || defaultData.sprint_name || 'Sprint 43';
    const sprintId = inputArgs.sprint_id || defaultData.sprint_id || 'upcoming_sprint';
    const teamSize = Number(defaultData.team_size ?? dbFallbackData.team_size ?? 0) || 0;
    const sprintDurationDays = Number(inputArgs.sprint_duration_days || 10);
    const focusFactor = 0.75; // 75% productive engineering time

    // Calculate Gross Available Hours
    const grossHours = Math.round(teamSize * sprintDurationDays * 8 * focusFactor);

    // Calculate Deductions (PTO + On-Call Shift Buffer)
    // PTO is only deducted when a live calendar actually reported it; otherwise it is unknown (null).
    const ptoDaysRaw = gcalData.pto_days_detected ?? dbFallbackData.pto_days_detected;
    const ptoDays = Number.isFinite(Number(ptoDaysRaw)) && ptoDaysRaw !== null ? Number(ptoDaysRaw) : null;
    const ptoHours = ptoDays === null ? 0 : Math.round(ptoDays * 8 * focusFactor);
    const onCallHours = grossHours > 0 ? Math.round(1 * 8 * focusFactor) : 0; // 1 on-call rotation buffer
    const netAvailableHours = Math.max(0, grossHours - ptoHours - onCallHours);
    const capacityRatio = grossHours > 0 ? netAvailableHours / grossHours : null;

    // Rolling 5-Sprint Velocity Calculation (real history only)
    const historicalVelocities = Array.isArray(defaultData.historical_velocities) && defaultData.historical_velocities.length > 0
      ? defaultData.historical_velocities
      : (Array.isArray(dbFallbackData.historical_velocities) ? dbFallbackData.historical_velocities : []);
    const velocities = historicalVelocities.map(Number).filter((v) => Number.isFinite(v));
    const velocityMean = velocities.length > 0
      ? Number((velocities.reduce((a, b) => a + b, 0) / velocities.length).toFixed(1))
      : null;
    const velocityStdDev = velocities.length > 0
      ? Number(Math.sqrt(velocities.reduce((sum, v) => sum + Math.pow(v - velocityMean, 2), 0) / velocities.length).toFixed(1))
      : null;

    // Target Recommended Commitment
    const targetCandidate = inputArgs.target_velocity ?? defaultData.rolling_avg_velocity ?? velocityMean;
    const baseTargetVelocity = targetCandidate === null || targetCandidate === undefined ? null : Number(targetCandidate);
    const hasPlanInputs = Number.isFinite(baseTargetVelocity) && capacityRatio !== null;
    const recommendedCommitment = hasPlanInputs ? Math.round(baseTargetVelocity * capacityRatio) : null;
    const bufferPoints = hasPlanInputs ? Math.max(2, Math.round(baseTargetVelocity * 0.10)) : null;

    // 70 / 20 / 10 Capacity Allocation Breakdown
    const techDebtPct = Number(inputArgs.custom_tech_debt_percentage || notionData.working_agreements?.tech_debt_target_percentage || 20);
    const unplannedBufferPct = Number(inputArgs.unplanned_buffer_percentage || 10);
    const featurePct = Math.max(10, 100 - techDebtPct - unplannedBufferPct);

    const featurePoints = hasPlanInputs ? Math.round((recommendedCommitment * featurePct) / 100) : null;
    const techDebtPoints = hasPlanInputs ? Math.round((recommendedCommitment * techDebtPct) / 100) : null;
    const bufferAllocationPoints = hasPlanInputs ? Math.max(1, recommendedCommitment - featurePoints - techDebtPoints) : null;

    // Backlog Candidate Processing (live Jira, then persisted sprint analytics; never synthesized)
    const candidateTickets = jiraData.candidate_tickets || defaultData.candidate_tickets || dbFallbackData.candidate_tickets || [];
    const ptsLabel = (p) => (p === null || p === undefined ? 'unestimated' : `${p} pts`);

    if (mode === 'LIST_RAW') {
      const ticketRows = candidateTickets.map((t) => {
        const url = process.env.JIRA_BASE_URL ? `${process.env.JIRA_BASE_URL.replace(/\/$/, '')}/browse/${t.key}` : '#';
        const typeBadge = t.is_tech_debt ? '🛠️ Tech Debt' : '✨ Feature';
        return `| [**${t.key}**](${url}) | **${t.summary}** | **${ptsLabel(t.story_points)}** | \`@${t.assignee}\` | ${typeBadge} |`;
      });

      const listSummary = `### 📋 Candidate Sprint Backlog: ${sprintName} (${candidateTickets.length} Tickets, ${candidateTickets.reduce((sum, t) => sum + (t.story_points || 0), 0)} pts)\n\n` +
        `| Jira Key | Summary | Estimate | Assignee | Category |\n| :--- | :--- | :---: | :--- | :---: |\n` +
        (ticketRows.length > 0 ? ticketRows.join('\n') : '| *No candidate tickets found* | - | - | - | - |') +
        `\n\n> 💡 **Commitment Target**: ${hasPlanInputs ? `Recommended capacity commitment is **${recommendedCommitment} pts**.` : 'No commitment can be recommended: team size or velocity history is unavailable.'}`;

      return {
        mode: 'LIST_RAW',
        sprint_id: sprintId,
        totalCandidates: candidateTickets.length,
        items: candidateTickets,
        summary: listSummary,
      };
    }

    // Risk Auditing & Concentration Checks
    const riskWarnings = [];
    const memberLoad = {};
    candidateTickets.forEach((t) => {
      if (t.assignee) {
        memberLoad[t.assignee] = (memberLoad[t.assignee] || 0) + (t.story_points || 0);
      }
    });

    const totalCandidatePoints = candidateTickets.reduce((sum, t) => sum + (t.story_points || 0), 0);
    Object.entries(memberLoad).forEach(([member, points]) => {
      const share = totalCandidatePoints > 0 ? (points / totalCandidatePoints) : 0;
      if (share > 0.35) {
        riskWarnings.push(`⚠️ **Developer Workload Concentration**: **${member}** is assigned **${points} pts (${Math.round(share * 100)}%)** of candidate scope. Consider rebalancing.`);
      }
    });

    if (ptoDays !== null && ptoDays >= 2) {
      riskWarnings.push(`📅 **Capacity Deduction**: **${ptoDays} days of team PTO** detected in the sprint window (-${ptoHours} engineering hours).`);
    }

    if (hasPlanInputs && totalCandidatePoints > recommendedCommitment) {
      riskWarnings.push(`🚨 **Scope Over-Commitment**: Total candidate backlog (**${totalCandidatePoints} pts**) exceeds recommended commitment target (**${recommendedCommitment} pts**) by **${totalCandidatePoints - recommendedCommitment} pts**.`);
    }

    if (!hasPlanInputs) {
      const missing = [];
      if (teamSize <= 0) missing.push('team roster (0 team members on record)');
      if (!Number.isFinite(baseTargetVelocity)) missing.push('velocity history (no completed sprints on record and no target velocity provided)');
      const syncedAt = defaultData.synced_at || dbFallbackData.synced_at || new Date().toISOString();
      return {
        mode: 'ANALYZE',
        status: 'NO_DATA',
        sprint_id: sprintId,
        sprint_name: sprintName,
        missing_inputs: missing,
        capacity_metrics: {
          team_size: teamSize,
          gross_capacity_hours: grossHours,
          net_capacity_hours: netAvailableHours,
          pto_hours_deducted: ptoHours,
          pto_days_detected: ptoDays,
          on_call_hours_deducted: onCallHours,
          rolling_avg_velocity_points: velocityMean,
          velocity_std_dev: velocityStdDev,
          recommended_commitment_points: null,
          commitment_buffer_points: null,
        },
        allocation_breakdown: {
          feature_percentage: featurePct,
          feature_points: null,
          tech_debt_percentage: techDebtPct,
          tech_debt_points: null,
          buffer_percentage: unplannedBufferPct,
          buffer_points: null,
        },
        risk_factors: riskWarnings,
        candidate_backlog: candidateTickets,
        summary: `### 📊 Sprint Capacity & Rolling Velocity Forecast: ${sprintName}\n\n` +
          `No sprint commitment can be computed. Missing: ${missing.join('; ')}.\n\n` +
          createProvenanceNotice(Boolean(dbFallbackData.is_cached), syncedAt, 'PostgreSQL sprint_analytics & team roster'),
      };
    }

    // Intentionally read-only: a sprint *plan* is a forecast, not sprint actuals. Writing it to
    // sprint_analytics (an upsert on sprint_id) would overwrite real total/completed points with a
    // forecast and `completed_points: 0`, corrupting the velocity history this planner reads, and
    // would record retro action items no retro produced.

    const summaryText = `### 📊 Sprint Capacity & Rolling Velocity Forecast: ${sprintName}

> **Sprint Duration**: ${sprintDurationDays} Days | **Team Size**: ${teamSize} Engineers | **5-Sprint Rolling Velocity**: **${velocityMean === null ? 'n/a (no sprint history)' : `${velocityMean} ± ${velocityStdDev} pts`}** | **Recommended Commitment**: **${recommendedCommitment} pts**

| Capacity Metric | Calculated Value | Baseline Comparison | Status |
| :--- | :---: | :---: | :---: |
| **Gross Available Hours** | **${grossHours} hrs** | ${teamSize} devs × ${sprintDurationDays}d × 8h × 75% | Standard Baseline |
| **PTO & On-Call Deductions** | **-${ptoHours + onCallHours} hrs** | ${ptoDays === null ? 'PTO unknown (no calendar data)' : `${ptoDays}d PTO (${ptoHours}h)`} + 1 on-call shift (${onCallHours}h) | 📅 Accounted |
| **Net Productive Hours** | **${netAvailableHours} hrs** | ${Math.round(capacityRatio * 100)}% of gross available time | ✅ Sustainable Pace |
| **Recommended Target Velocity** | **${recommendedCommitment} pts** | Adjusted for availability (-${baseTargetVelocity - recommendedCommitment} pts) | 🎯 High Reliability |

> 💡 **Executive Bottom Line**: Lock commitment to **${recommendedCommitment} story points** (${featurePoints} pts Features, ${techDebtPoints} pts Tech Debt, ${bufferAllocationPoints} pts Buffer). ${riskWarnings.length > 0 ? riskWarnings[0] : 'Capacity is evenly distributed.'}

<details>
<summary><b>🎯 Capacity Allocation (${featurePct}/${techDebtPct}/${unplannedBufferPct} Rule) & Execution Risks</b></summary>

- 🚀 **Feature Deliverables (${featurePct}%)**: **${featurePoints} story points**
- 🛠️ **Technical Debt & Reliability (${techDebtPct}%)**: **${techDebtPoints} story points**
- 🛡️ **Unplanned Scope & Incident Buffer (${unplannedBufferPct}%)**: **${bufferAllocationPoints} story points**

\`\`\`
[ Features: ${featurePoints} pts (${featurePct}%) ] [ Tech Debt: ${techDebtPoints} pts (${techDebtPct}%) ] [ Buffer: ${bufferAllocationPoints} pts (${unplannedBufferPct}%) ]
\`\`\`

- **Execution Risks & Workload Audit**:
${riskWarnings.length > 0 ? riskWarnings.map((w) => `  * ${w}`).join('\n') : '  * ✅ Zero high-severity concentration risks detected.'}

</details>

<details>
<summary><b>📋 Recommended Candidate Backlog (${candidateTickets.length} Issues, ${totalCandidatePoints} pts)</b></summary>

| Issue Key | Summary | Type | Points | Assignee |
| :--- | :--- | :---: | :---: | :--- |
${candidateTickets.map((t) => `| ${formatMarkdownLinkOrCode(t.key, getDirectOrFormattedJiraUrl(t))} | ${t.summary} | ${t.is_tech_debt ? '🛠️ Tech Debt' : '🚀 Feature'} | **${ptsLabel(t.story_points)}** | ${t.assignee} |`).join('\n')}

- **Ceremony Next Steps**: Ensure peer pairing for issues $\ge 5$ story points.

</details>
`;

    return {
      mode: 'ANALYZE',
      sprint_id: sprintId,
      sprint_name: sprintName,
      capacity_metrics: {
        team_size: teamSize,
        gross_capacity_hours: grossHours,
        net_capacity_hours: netAvailableHours,
        pto_hours_deducted: ptoHours,
        pto_days_detected: ptoDays,
        on_call_hours_deducted: onCallHours,
        rolling_avg_velocity_points: velocityMean,
        velocity_std_dev: velocityStdDev,
        recommended_commitment_points: recommendedCommitment,
        commitment_buffer_points: bufferPoints,
      },
      allocation_breakdown: {
        feature_percentage: featurePct,
        feature_points: featurePoints,
        tech_debt_percentage: techDebtPct,
        tech_debt_points: techDebtPoints,
        buffer_percentage: unplannedBufferPct,
        buffer_points: bufferAllocationPoints,
      },
      risk_factors: riskWarnings,
      candidate_backlog: candidateTickets,
      summary: summaryText,
    };
  },
});

export function createSprintAgent(customTools = null, options = {}) {
  return createMicroAgent({
    name: 'sprint_agent',
    defaultTool: sprintPlanTool,
    promptTemplate: sprintAgentPromptTemplate,
    customTools,
    options,
  });
}

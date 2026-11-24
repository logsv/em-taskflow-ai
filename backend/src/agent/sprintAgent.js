import { z } from 'zod';
import { sprintAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import identityService from '../services/identityService.js';
import settingsService from '../services/settingsService.js';
import { info, warn, error } from '../utils/logger.js';
import { getDirectOrFormattedJiraUrl, formatMarkdownLinkOrCode } from '../utils/urlHelper.js';
import { createMicroAgent, safeExecuteMCPTool } from './baseAgent.js';
import { swallow, recordHandledError } from '../core/safe.js';

/** Planning assumptions. They are rules of thumb, shown to the user as assumptions, not data. */
export const SPRINT_ASSUMPTIONS = {
  hoursPerDay: 8,
  focusFactor: 0.75,
  onCallDaysPerSprint: 1,
};

function positiveOrNull(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Story points as recorded in Jira, or null when the issue is unestimated. */
export function extractStoryPoints(issue) {
  return positiveOrNull(issue?.story_points ?? issue?.fields?.customfield_10016 ?? issue?.fields?.story_points);
}

/** Velocities from completed sprints only (completed_points > 0); planned totals are not velocity. */
export function completedVelocities(analytics = []) {
  return analytics
    .map((s) => positiveOrNull(s?.completed_points))
    .filter((v) => v !== null)
    .slice(0, 5);
}

export const sprintPlanTool = createDeterministicToolHarness({
  name: 'calculate_sprint_plan',
  description: 'Calculates sprint capacity, rolling velocity from completed sprints, capacity allocation, developer concentration risk, and the candidate backlog. Reports only measured data and states its planning assumptions.',
  featureFlagKey: 'sprint',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'jira', 'googleCalendar']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    sprint_id: z.string().optional(),
    sprint_name: z.string().optional(),
    sprint_duration_days: z.number().default(10),
    team_members: z.array(z.string()).default([]),
    custom_tech_debt_percentage: z.number().default(20),
    unplanned_buffer_percentage: z.number().default(10),
    target_velocity: z.number().optional().describe('Explicit target velocity (points) when there is no completed-sprint history'),
    team_capacity: z.number().optional().describe('Explicit net team capacity in hours'),
    backlog_ids: z.array(z.string()).default([]),
    fetch_fresh_data: z.boolean().default(true),
  }),
  mcpExecutors: {
    jira: async () => {
      try {
        const jql = 'status in ("To Do", "Ready for Sprint", "Backlog") AND (sprint is null OR sprint in openSprints()) ORDER BY priority DESC';
        const res = await safeExecuteMCPTool('jira_search', { jql });
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);
        if (issues.length > 0) {
          return {
            total_candidate_issues: issues.length,
            candidate_tickets: issues.slice(0, 8).filter((iss) => iss?.key).map((iss) => {
              const summary = iss.summary || iss.fields?.summary || '';
              return {
                key: iss.key,
                summary: summary || '(no summary)',
                story_points: extractStoryPoints(iss),
                assignee: iss.assignee || iss.fields?.assignee?.displayName || 'Unassigned',
                is_tech_debt: /tech|debt|refactor|migration|perf|cleanup/i.test(summary),
              };
            }),
            source: 'mcp_jira',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'sprintHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    googleCalendar: async () => {
      try {
        const res = await safeExecuteMCPTool('get_calendar_events', { time_window: '14d', max_results: 50 });
        if (!Array.isArray(res)) return null;
        const ptoEvents = res.filter((e) => /\b(pto|ooo|out of office|vacation|leave|holiday)\b/i.test(e.summary || ''));
        return {
          total_events: res.length,
          pto_events_count: ptoEvents.length,
          // One all-day PTO event is counted as one person-day.
          pto_days_detected: ptoEvents.length,
          source: 'mcp_google_calendar',
          synced_at: new Date().toISOString(),
        };
      } catch (err) {
        warn({ module: 'sprintHarness', action: 'calendarExecutor', err: err.message }, 'Calendar executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const members = await identityService.getTeamMembers().catch(swallow('agent.sprintAgent.default', []));
      const analytics = await databaseService.getSprintAnalytics().catch(swallow('agent.sprintAgent.default', []));
      const velocities = completedVelocities(analytics);
      return {
        team_size: inputArgs.team_members?.length || members.length || null,
        team_members: inputArgs.team_members?.length ? inputArgs.team_members : members.map((m) => m.displayName),
        historical_velocities: velocities,
        data_source: 'postgres_sprint_analytics',
        synced_at: new Date().toISOString(),
      };
    },
  },
  dbCacheFallback: async (source, inputArgs = {}) => {
    if (source === 'jira') {
      return { candidate_tickets: [], is_cached: true, data_source: 'none', data_availability: 'no_jira_data' };
    }
    if (source === 'googleCalendar') {
      return { pto_days_detected: null, is_cached: true, data_source: 'none', data_availability: 'no_calendar_data' };
    }
    const members = await databaseService.getTeamMembers().catch(swallow('agent.sprintAgent.dbCacheFallback', []));
    const analytics = await databaseService.getSprintAnalytics().catch(swallow('agent.sprintAgent.dbCacheFallback', []));
    const velocities = completedVelocities(analytics);
    const teamSize = inputArgs?.team_members?.length || members.length || null;
    return {
      sprint_id: inputArgs?.sprint_id || null,
      team_size: teamSize,
      team_members: members.map((m) => m.displayName),
      historical_velocities: velocities,
      rolling_avg_velocity: velocities.length > 0 ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : null,
      is_cached: true,
      data_source: 'postgres_sprint_analytics',
      data_availability: velocities.length > 0 ? 'ok' : 'no_completed_sprints',
    };
  },
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data || {};
    const jiraData = sourceResults.jira?.data || {};
    const gcalData = sourceResults.googleCalendar?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';
    const { hoursPerDay, focusFactor, onCallDaysPerSprint } = SPRINT_ASSUMPTIONS;

    const sprintName = inputArgs.sprint_name || inputArgs.sprint_id || 'the upcoming sprint';
    const sprintId = inputArgs.sprint_id || null;
    const sprintDurationDays = Number(inputArgs.sprint_duration_days || 10);
    const candidateTickets = Array.isArray(jiraData.candidate_tickets) ? jiraData.candidate_tickets : [];
    const estimated = candidateTickets.filter((t) => t.story_points !== null && t.story_points !== undefined);
    const totalCandidatePoints = estimated.reduce((sum, t) => sum + t.story_points, 0);
    const unestimatedCount = candidateTickets.length - estimated.length;

    // Capacity: explicit hours, or team size × assumptions. PTO only when the calendar was read.
    const teamSize = positiveOrNull(defaultData.team_size);
    const ptoKnown = gcalData.pto_days_detected !== null && gcalData.pto_days_detected !== undefined;
    const ptoDays = ptoKnown ? Number(gcalData.pto_days_detected) : 0;
    const ptoHours = Math.round(ptoDays * hoursPerDay * focusFactor);
    const onCallHours = Math.round(onCallDaysPerSprint * hoursPerDay * focusFactor);
    const explicitCapacity = positiveOrNull(inputArgs.team_capacity);
    const grossHours = explicitCapacity ?? (teamSize ? Math.round(teamSize * sprintDurationDays * hoursPerDay * focusFactor) : null);
    const netAvailableHours = grossHours === null ? null : (explicitCapacity ?? Math.max(0, grossHours - ptoHours - onCallHours));
    const capacityRatio = grossHours ? netAvailableHours / grossHours : null;

    // Velocity: completed sprints only, or an explicit target.
    const velocities = Array.isArray(defaultData.historical_velocities) ? defaultData.historical_velocities.filter((v) => positiveOrNull(v) !== null) : [];
    const velocityMean = velocities.length > 0 ? Number((velocities.reduce((a, b) => a + b, 0) / velocities.length).toFixed(1)) : null;
    const velocityStdDev = velocities.length > 0
      ? Number(Math.sqrt(velocities.reduce((sum, v) => sum + (v - velocityMean) ** 2, 0) / velocities.length).toFixed(1))
      : null;
    const baseTargetVelocity = positiveOrNull(inputArgs.target_velocity) ?? velocityMean;
    const velocitySource = positiveOrNull(inputArgs.target_velocity) ? 'explicit_target' : velocityMean !== null ? 'completed_sprints' : 'none';
    const recommendedCommitment = baseTargetVelocity === null
      ? null
      : Math.round(baseTargetVelocity * (capacityRatio ?? 1));
    const bufferPoints = recommendedCommitment === null ? null : Math.max(1, Math.round(baseTargetVelocity * 0.1));

    // Allocation policy (configurable percentages, not data).
    const techDebtPct = Number(inputArgs.custom_tech_debt_percentage ?? 20);
    const unplannedBufferPct = Number(inputArgs.unplanned_buffer_percentage ?? 10);
    const featurePct = Math.max(0, 100 - techDebtPct - unplannedBufferPct);
    const featurePoints = recommendedCommitment === null ? null : Math.round((recommendedCommitment * featurePct) / 100);
    const techDebtPoints = recommendedCommitment === null ? null : Math.round((recommendedCommitment * techDebtPct) / 100);
    const bufferAllocationPoints = recommendedCommitment === null ? null : recommendedCommitment - featurePoints - techDebtPoints;

    const ticketLink = (t) => formatMarkdownLinkOrCode(t.key, getDirectOrFormattedJiraUrl(t));
    const pts = (t) => (t.story_points === null || t.story_points === undefined ? 'unestimated' : `${t.story_points} pts`);

    if (mode === 'LIST_RAW') {
      const rows = candidateTickets.map((t) => `| ${ticketLink(t)} | **${t.summary}** | **${pts(t)}** | \`@${t.assignee}\` | ${t.is_tech_debt ? '🛠️ Tech Debt' : '✨ Feature'} |`);
      const listSummary = `### 📋 Candidate Sprint Backlog: ${sprintName} (${candidateTickets.length} Tickets, ${totalCandidatePoints} estimated pts${unestimatedCount ? `, ${unestimatedCount} unestimated` : ''})\n\n` +
        (rows.length > 0
          ? `| Jira Key | Summary | Estimate | Assignee | Category |\n| :--- | :--- | :---: | :--- | :---: |\n${rows.join('\n')}`
          : '> No candidate tickets available. Connect Jira in Admin → Settings to list the backlog.') +
        (recommendedCommitment !== null ? `\n\n> 💡 **Commitment Target**: ${recommendedCommitment} pts.` : '');
      return {
        mode: 'LIST_RAW',
        sprint_id: sprintId,
        totalCandidates: candidateTickets.length,
        items: candidateTickets,
        data_availability: candidateTickets.length > 0 ? 'ok' : 'no_jira_data',
        summary: listSummary,
      };
    }

    // Risks from measured data only.
    const riskWarnings = [];
    const memberLoad = {};
    estimated.forEach((t) => {
      if (t.assignee && t.assignee !== 'Unassigned') memberLoad[t.assignee] = (memberLoad[t.assignee] || 0) + t.story_points;
    });
    Object.entries(memberLoad).forEach(([member, points]) => {
      const share = totalCandidatePoints > 0 ? points / totalCandidatePoints : 0;
      if (share > 0.35) riskWarnings.push(`⚠️ **Developer Workload Concentration**: **${member}** holds **${points} pts (${Math.round(share * 100)}%)** of estimated candidate scope.`);
    });
    if (ptoKnown && ptoDays >= 2) riskWarnings.push(`📅 **Capacity Deduction**: ${ptoDays} PTO day(s) found in the calendar (-${ptoHours} hours).`);
    if (recommendedCommitment !== null && totalCandidatePoints > recommendedCommitment) {
      riskWarnings.push(`🚨 **Scope Over-Commitment**: estimated candidate backlog (**${totalCandidatePoints} pts**) exceeds the recommended commitment (**${recommendedCommitment} pts**).`);
    }
    if (unestimatedCount > 0) riskWarnings.push(`❔ **Unestimated Work**: ${unestimatedCount} candidate ticket(s) have no story points.`);

    const missing = [];
    if (velocitySource === 'none') missing.push('no completed-sprint velocity history (record completed sprints or pass a target velocity)');
    if (grossHours === null) missing.push('team size unknown (add the team in Admin → Team or pass team capacity)');
    if (!ptoKnown) missing.push('PTO not checked (Google Calendar not connected)');
    if (candidateTickets.length === 0) missing.push('no candidate backlog (Jira not connected)');

    const v = (x, unit = '') => (x === null || x === undefined ? 'unknown' : `${x}${unit}`);
    const summaryText = `### 📊 Sprint Capacity & Rolling Velocity Forecast: ${sprintName}

> **Sprint Duration**: ${sprintDurationDays} days | **Team Size**: ${v(teamSize)} | **Rolling Velocity (completed sprints)**: **${velocityMean === null ? 'no history' : `${velocityMean} ± ${velocityStdDev} pts`}** | **Recommended Commitment**: **${v(recommendedCommitment, ' pts')}**
${missing.length > 0 ? `\n> ⚠️ **Data gaps**: ${missing.join('; ')}.\n` : ''}
| Capacity Metric | Value | Basis |
| :--- | :---: | :--- |
| **Gross Available Hours** | **${v(grossHours, ' hrs')}** | ${explicitCapacity ? 'explicit team capacity' : teamSize ? `${teamSize} devs × ${sprintDurationDays}d × ${hoursPerDay}h × ${focusFactor * 100}% focus (assumption)` : 'unknown team size'} |
| **PTO & On-Call Deductions** | **${grossHours === null || explicitCapacity ? 'n/a' : `-${ptoHours + onCallHours} hrs`}** | ${ptoKnown ? `${ptoDays} PTO day(s) from calendar` : 'PTO not checked'} + ${onCallDaysPerSprint} on-call day (assumption) |
| **Net Productive Hours** | **${v(netAvailableHours, ' hrs')}** | ${capacityRatio === null ? '—' : `${Math.round(capacityRatio * 100)}% of gross`} |
| **Recommended Commitment** | **${v(recommendedCommitment, ' pts')}** | ${velocitySource === 'explicit_target' ? 'explicit target velocity' : velocitySource === 'completed_sprints' ? `${velocities.length} completed sprint(s)` : 'no velocity basis'} |

<details>
<summary><b>🎯 Capacity Allocation (${featurePct}/${techDebtPct}/${unplannedBufferPct} policy) & Execution Risks</b></summary>

- 🚀 **Features (${featurePct}%)**: ${v(featurePoints, ' pts')}
- 🛠️ **Tech Debt & Reliability (${techDebtPct}%)**: ${v(techDebtPoints, ' pts')}
- 🛡️ **Unplanned Buffer (${unplannedBufferPct}%)**: ${v(bufferAllocationPoints, ' pts')}

- **Execution Risks**:
${riskWarnings.length > 0 ? riskWarnings.map((w) => `  * ${w}`).join('\n') : '  * No risks detected in the available data.'}

</details>

<details>
<summary><b>📋 Candidate Backlog (${candidateTickets.length} Issues, ${totalCandidatePoints} estimated pts)</b></summary>

${candidateTickets.length > 0
    ? `| Issue Key | Summary | Type | Points | Assignee |\n| :--- | :--- | :---: | :---: | :--- |\n${candidateTickets.map((t) => `| ${ticketLink(t)} | ${t.summary} | ${t.is_tech_debt ? '🛠️ Tech Debt' : '🚀 Feature'} | **${pts(t)}** | ${t.assignee} |`).join('\n')}`
    : '> No candidate tickets available (Jira not connected).'}

</details>
`;

    return {
      mode: 'ANALYZE',
      sprint_id: sprintId,
      sprint_name: inputArgs.sprint_name || null,
      data_gaps: missing,
      assumptions: SPRINT_ASSUMPTIONS,
      capacity_metrics: {
        team_size: teamSize,
        gross_capacity_hours: grossHours,
        net_capacity_hours: netAvailableHours,
        pto_hours_deducted: ptoKnown ? ptoHours : null,
        on_call_hours_deducted: grossHours === null || explicitCapacity ? null : onCallHours,
        rolling_avg_velocity_points: velocityMean,
        velocity_std_dev: velocityStdDev,
        velocity_source: velocitySource,
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

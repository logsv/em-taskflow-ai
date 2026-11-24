import { z } from 'zod';
import { peopleAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import identityService from '../services/identityService.js';
import { createMicroAgent, safeExecuteMCPTool, resolveMemberTarget } from './baseAgent.js';
import { warn } from '../utils/logger.js';
import { swallow, recordHandledError } from '../core/safe.js';

// Standard 12 Competency Dimensions
export const COMPETENCY_DIMENSIONS = [
  { key: 'ARCH', name: 'Architecture & System Design', desc: 'Modularity, distributed patterns, RFC authorship' },
  { key: 'DB', name: 'Data Modeling & Storage', desc: 'Schema design, indexing, caching, consistency models' },
  { key: 'CLOUD', name: 'Cloud & Infrastructure', desc: 'CI/CD automation, containers, observability, IaC' },
  { key: 'SEC', name: 'Security & Compliance', desc: 'AuthN/AuthZ, OWASP defenses, zero-trust, data privacy' },
  { key: 'CODE', name: 'Code Quality & Testing', desc: 'Clean architecture, unit/integration testing, maintainability' },
  { key: 'DELIV', name: 'Delivery Velocity & Execution', desc: 'Sprint task breakdown, estimation, unblocking dependencies' },
  { key: 'MENTOR', name: 'Mentoring & Peer Growth', desc: 'Pair programming, constructive reviews, onboarding' },
  { key: 'COLLAB', name: 'Cross-Functional Collaboration', desc: 'Product, Design, QA, and cross-team alignment' },
  { key: 'STRAT', name: 'Technical Strategy & Vision', desc: 'Tech debt reduction, multi-quarter architectural vision' },
  { key: 'INCID', name: 'Incident & Production Leadership', desc: 'On-call triage, Incident Commander, post-mortem root causes' },
  { key: 'ALIGN', name: 'Stakeholder & Business Alignment', desc: 'Translating business OKRs into technical requirements' },
  { key: 'CULT', name: 'Culture & Community', desc: 'Tech talks, inclusive team practices, knowledge sharing' },
];

// Standard Level Benchmark Profiles (1.0 to 5.0)
export const LEVEL_BENCHMARKS = {
  L3_JUNIOR: {
    ARCH: 2.0, DB: 2.0, CLOUD: 2.0, SEC: 2.0, CODE: 3.0, DELIV: 2.5,
    MENTOR: 1.0, COLLAB: 2.0, STRAT: 1.0, INCID: 1.5, ALIGN: 1.5, CULT: 2.0,
  },
  L4_MID: {
    ARCH: 3.0, DB: 3.0, CLOUD: 3.0, SEC: 3.0, CODE: 4.0, DELIV: 3.5,
    MENTOR: 2.5, COLLAB: 3.0, STRAT: 2.0, INCID: 3.0, ALIGN: 2.5, CULT: 3.0,
  },
  L5_SENIOR: {
    ARCH: 4.5, DB: 4.0, CLOUD: 4.0, SEC: 4.0, CODE: 4.5, DELIV: 4.0,
    MENTOR: 4.0, COLLAB: 4.0, STRAT: 3.5, INCID: 4.0, ALIGN: 3.5, CULT: 4.0,
  },
  L6_STAFF: {
    ARCH: 5.0, DB: 4.5, CLOUD: 4.5, SEC: 4.5, CODE: 4.8, DELIV: 4.5,
    MENTOR: 4.8, COLLAB: 4.8, STRAT: 5.0, INCID: 4.5, ALIGN: 4.8, CULT: 4.8,
  },
  L7_PRINCIPAL: {
    ARCH: 5.0, DB: 5.0, CLOUD: 5.0, SEC: 5.0, CODE: 5.0, DELIV: 4.8,
    MENTOR: 5.0, COLLAB: 5.0, STRAT: 5.0, INCID: 5.0, ALIGN: 5.0, CULT: 5.0,
  },
  M1_EM: {
    ARCH: 3.5, DB: 3.0, CLOUD: 3.0, SEC: 3.5, CODE: 3.5, DELIV: 4.8,
    MENTOR: 5.0, COLLAB: 5.0, STRAT: 4.5, INCID: 4.5, ALIGN: 5.0, CULT: 5.0,
  },
  M2_SENIOR_EM: {
    ARCH: 4.0, DB: 3.5, CLOUD: 3.5, SEC: 4.0, CODE: 3.5, DELIV: 5.0,
    MENTOR: 5.0, COLLAB: 5.0, STRAT: 5.0, INCID: 5.0, ALIGN: 5.0, CULT: 5.0,
  },
};

/**
 * Sum the duration of events that carry real start/end timestamps.
 * Returns null when no event has both (the load is unknown, not zero).
 */
export function computeMeetingHours(events = []) {
  let totalMs = 0;
  let counted = 0;
  for (const ev of events) {
    const start = Date.parse(ev?.start?.dateTime || ev?.start_time || ev?.start || '');
    const end = Date.parse(ev?.end?.dateTime || ev?.end_time || ev?.end || '');
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      totalMs += end - start;
      counted += 1;
    }
  }
  return counted > 0 ? Number((totalMs / 3_600_000).toFixed(1)) : null;
}

function hasRatings(ratings) {
  return !!ratings && typeof ratings === 'object' && Object.values(ratings).some((v) => typeof v === 'number' && Number.isFinite(v));
}

function finiteOrNull(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? n : null;
}

async function resolveRequestedMember(engineerId) {
  if (!engineerId) return null;
  return (await identityService.resolveMember(engineerId)) || (await identityService.resolveMemberFromText(engineerId));
}

export const peopleGrowthTool = createDeterministicToolHarness({
  name: 'analyze_personnel_growth',
  description: 'Analyzes an engineer\'s career growth against level benchmarks, 1-on-1 cadence, and meeting load. Requires a known engineer (team roster) and reports only measured data.',
  featureFlagKey: 'people',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'googleCalendar', 'notion']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    filter: z.enum(['ALL', 'TODAY_EVENTS', 'ONE_ON_ONES', 'CAREER_NOTES', 'SKILL_GAPS']).default('ALL'),
    target: z.enum(['ALL', 'ONE_ON_ONES', 'SKILL_GAPS', 'RADAR', 'CAREER_NOTES']).default('ALL'),
    engineer_id: z.string().optional().describe('Name, alias, or identifier of the engineer (resolved against the team roster)'),
    current_level: z.enum(['L3_JUNIOR', 'L4_MID', 'L5_SENIOR', 'L6_STAFF', 'L7_PRINCIPAL', 'M1_EM']).optional(),
    target_level: z.enum(['L4_MID', 'L5_SENIOR', 'L6_STAFF', 'L7_PRINCIPAL', 'M1_EM', 'M2_SENIOR_EM']).optional(),
    track: z.enum(['INDIVIDUAL_CONTRIBUTOR', 'ENGINEERING_MANAGEMENT']).optional(),
    tenure_months: z.number().optional(),
    skill_ratings: z.record(z.string(), z.number()).optional().describe('Measured 12-dimension ratings map (1.0-5.0)'),
    weekly_workload_hours: z.number().optional().describe('Measured weekly workload hours, if known'),
    weekly_meeting_hours: z.number().optional().describe('Measured weekly meeting hours, if known'),
    review_period: z.string().default('current_quarter'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: live sources. Each returns null when it has no real data.
  mcpExecutors: {
    googleCalendar: async (inputArgs) => {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const member = await resolveRequestedMember(inputArgs?.engineer_id);
        const gcalUser = member?.gcalEmail || (inputArgs?.engineer_id ? await identityService.getToolUsernameForMember(inputArgs.engineer_id, 'gcal') : null);

        let timer;
        const res = await Promise.race([
          executeMCPTool('get_calendar_events', { user: gcalUser || 'primary', time_window: '7d' }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MCP GCal timed out')), 2500); }),
        ]).catch(swallow('agent.peopleAgent.googleCalendar', null)).finally(() => clearTimeout(timer));

        if (Array.isArray(res) && res.length > 0) {
          return {
            today_events: res,
            weekly_meeting_hours: computeMeetingHours(res),
            source: 'mcp_google_calendar',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'peopleHarness', action: 'calendarExecutor', err: err.message }, 'Calendar executor notice');
      }
      return null;
    },
    notion: async (inputArgs) => {
      try {
        const member = await resolveRequestedMember(inputArgs?.engineer_id);
        if (!member) return null;
        const configuredPageId = settingsService.getCachedSettings()?.mcp?.notion?.careerPageId || process.env.NOTION_CAREER_PAGE_ID;
        const res = await safeExecuteMCPTool('notion_search', {
          query: configuredPageId || `1-on-1 ${member.displayName} career progression`,
        });
        const pages = Array.isArray(res) ? res : (Array.isArray(res?.results) ? res.results : []);
        const docs = pages
          .filter((p) => p && p.url)
          .slice(0, 3)
          .map((p) => ({ title: p.title || p.name || 'Untitled page', url: p.url, last_edited: p.last_edited_time || null }));
        if (docs.length > 0) {
          return { career_notes_count: docs.length, career_docs: docs, source: 'mcp_notion', synced_at: new Date().toISOString() };
        }
      } catch (err) {
        warn({ module: 'peopleHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    jira: async (inputArgs) => {
      try {
        const member = await resolveRequestedMember(inputArgs?.engineer_id);
        if (!member) return null;
        const { toolUsername } = await resolveMemberTarget(inputArgs.engineer_id, 'jira');
        if (!toolUsername || toolUsername === 'unassigned') return null;
        const res = await safeExecuteMCPTool('jira_search', {
          jql: `assignee = "${toolUsername}" AND issuetype in (Epic, Initiative, "Technical Story")`,
        });
        if (res) {
          const issues = Array.isArray(res) ? res : (Array.isArray(res.issues) ? res.issues : []);
          return { leadership_epics_count: issues.length, leadership_epics: issues.slice(0, 3), source: 'mcp_jira', synced_at: new Date().toISOString() };
        }
      } catch (err) {
        warn({ module: 'peopleHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const member = await resolveRequestedMember(inputArgs?.engineer_id);
      if (!member) return null; // let the DB fallback report what is (not) known
      return {
        engineer_id: member.id,
        displayName: member.displayName,
        current_level: member.currentLevel || null,
        target_level: member.targetLevel || null,
        track: member.track || null,
        tenure_months: finiteOrNull(member.tenureMonths),
        skills: member.skills || null,
        profile_source: 'team_roster',
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 3: PostgreSQL team roster. Never invents a person, events or documents.
  dbCacheFallback: async (source, inputArgs = {}) => {
    if (source === 'googleCalendar' || source === 'google') {
      return { today_events: [], weekly_meeting_hours: null, is_cached: true, data_source: 'none', data_availability: 'no_calendar_data' };
    }
    if (source === 'notion') {
      return { career_notes_count: 0, career_docs: [], is_cached: true, data_source: 'none', data_availability: 'no_notion_data' };
    }
    if (source === 'jira') {
      return { leadership_epics_count: 0, leadership_epics: [], is_cached: true, data_source: 'none', data_availability: 'no_jira_data' };
    }
    const member = await resolveRequestedMember(inputArgs?.engineer_id).catch(swallow('agent.peopleAgent.dbCacheFallback', null));
    if (!member) {
      return { is_cached: true, data_source: 'none', data_availability: inputArgs?.engineer_id ? 'engineer_not_in_roster' : 'engineer_not_specified' };
    }
    return {
      engineer_id: member.id,
      displayName: member.displayName,
      current_level: member.currentLevel || null,
      target_level: member.targetLevel || null,
      track: member.track || null,
      tenure_months: finiteOrNull(member.tenureMonths),
      skills: member.skills || null,
      profile_source: 'team_roster',
      is_cached: true,
      data_source: 'postgres_team_members',
      synced_at: member.updatedAt || null,
    };
  },
  computeMath: async (sourceResults, inputArgs) => {
    const mode = inputArgs.mode || 'ANALYZE';
    const profile = sourceResults.default?.data || {};
    const calendar = sourceResults.googleCalendar?.data || sourceResults.google?.data || {};
    const notionData = sourceResults.notion?.data || {};

    const member = await resolveRequestedMember(inputArgs.engineer_id);
    const displayName = member?.displayName || profile.displayName || null;
    const events = Array.isArray(calendar.today_events) ? calendar.today_events : [];

    if (mode === 'LIST_RAW') {
      const rows = events.map((e) => `| **${e.summary || 'Untitled event'}** | \`${e.start_time || e.start?.dateTime || e.start?.date || 'unknown time'}\` | \`${e.attendee || e.attendees?.[0]?.email || 'unknown'}\` |`);
      const summary = `### 📅 Scheduled 1-on-1 & Growth Check-ins (${events.length} Events)\n\n` +
        (rows.length > 0
          ? `| Meeting / Event | Time | Attendee |\n| :--- | :---: | :--- |\n${rows.join('\n')}`
          : '> No calendar data available. Connect Google Calendar in Admin → Settings to list 1-on-1s.');
      return {
        mode: 'LIST_RAW',
        filter: inputArgs.filter || 'ALL',
        target: inputArgs.target || 'ALL',
        totalEvents: events.length,
        items: events,
        data_availability: events.length > 0 ? 'ok' : 'no_calendar_data',
        summary,
      };
    }

    // A profile needs a known engineer (roster) or explicit levels from the caller.
    const currentLevel = inputArgs.current_level || member?.currentLevel || profile.current_level || null;
    const targetLevel = inputArgs.target_level || member?.targetLevel || profile.target_level || null;
    if (!displayName && !(inputArgs.current_level && inputArgs.target_level)) {
      const asked = inputArgs.engineer_id ? `"${inputArgs.engineer_id}" is not in the team roster.` : 'No engineer was specified.';
      return {
        mode,
        status: 'NEEDS_ENGINEER',
        data_availability: inputArgs.engineer_id ? 'engineer_not_in_roster' : 'engineer_not_specified',
        summary: `### 🎯 Career Growth Analysis\n\n> ${asked} Tell me which engineer you mean, or add them in **Admin → Team** (with their level and skill ratings) so I can analyse real data.`,
      };
    }
    if (!currentLevel || !targetLevel) {
      return {
        mode,
        status: 'NEEDS_PROFILE',
        engineer_id: member?.id || inputArgs.engineer_id || null,
        data_availability: 'levels_not_recorded',
        summary: `### 🎯 Career Growth Analysis: ${displayName}\n\n> Current and target levels are not recorded for ${displayName}. Add them in **Admin → Team** to compare against level benchmarks.`,
      };
    }

    const subject = displayName || inputArgs.engineer_id || 'the engineer';
    const track = inputArgs.track || member?.track || profile.track || 'INDIVIDUAL_CONTRIBUTOR';
    const tenureMonths = finiteOrNull(inputArgs.tenure_months ?? member?.tenureMonths ?? profile.tenure_months);

    // Measured load only: caller input, roster/profile data, or calendar durations.
    const workloadHours = finiteOrNull(inputArgs.weekly_workload_hours ?? profile.weekly_workload_hours);
    const meetingHours = finiteOrNull(inputArgs.weekly_meeting_hours ?? calendar.weekly_meeting_hours);
    let burnoutRisk = 'UNKNOWN';
    if (workloadHours !== null || meetingHours !== null) {
      burnoutRisk = 'LOW';
      if ((workloadHours ?? 0) > 50.0 || (meetingHours ?? 0) > 22.0) burnoutRisk = 'HIGH';
      else if ((workloadHours ?? 0) > 44.0 || (meetingHours ?? 0) > 16.0) burnoutRisk = 'MEDIUM';
    }

    // Skill gaps only from recorded ratings (caller input or roster skills).
    const ratings = hasRatings(inputArgs.skill_ratings) ? inputArgs.skill_ratings : (hasRatings(member?.skills) ? member.skills : (hasRatings(profile.skills) ? profile.skills : null));
    const assessed = !!ratings;
    const targetReqs = LEVEL_BENCHMARKS[targetLevel] || {};
    const competencyRadar = [];
    const significantGaps = [];
    let totalGaps = 0;
    let totalTargetWeight = 0;

    COMPETENCY_DIMENSIONS.forEach((dim) => {
      const targetRating = finiteOrNull(targetReqs[dim.key]);
      const currentRating = assessed ? finiteOrNull(ratings[dim.key]) : null;
      if (currentRating === null || targetRating === null) {
        competencyRadar.push({ dimension: dim.name, code: dim.key, current: currentRating, target: targetRating, gap: null, status: 'NOT_ASSESSED' });
        return;
      }
      const gap = Math.max(0, Number((targetRating - currentRating).toFixed(1)));
      totalGaps += gap;
      totalTargetWeight += targetRating;
      let status = 'MET';
      if (gap >= 1.0) status = 'MAJOR_GAP';
      else if (gap > 0) status = 'MINOR_GAP';
      if (gap > 0) significantGaps.push(`${dim.name} (-${gap})`);
      competencyRadar.push({ dimension: dim.name, code: dim.key, current: Number(currentRating.toFixed(1)), target: Number(targetRating.toFixed(1)), gap, status });
    });

    const assessedCount = competencyRadar.filter((r) => r.status !== 'NOT_ASSESSED').length;
    const readinessScore = assessedCount > 0 && totalTargetWeight > 0
      ? Math.min(100, Math.max(0, Math.round((1 - totalGaps / totalTargetWeight) * 100)))
      : null;
    let readinessVerdict = 'NOT_ASSESSED';
    if (readinessScore !== null) {
      readinessVerdict = readinessScore >= 90 ? 'READY_FOR_PROMOTION' : readinessScore < 75 ? 'DEVELOPING' : 'ON_TRACK';
    }

    // Prerequisites are a checklist to verify with evidence, never auto-marked as met.
    const prerequisites = [
      { name: 'Lead 1 high-impact architecture RFC to approval', status: 'NOT_VERIFIED' },
      { name: 'Complete 1 mentorship cycle with positive peer feedback', status: 'NOT_VERIFIED' },
      { name: 'No critical production regressions in the last 2 quarters', status: 'NOT_VERIFIED' },
      { name: 'Active incident commander / on-call participation', status: 'NOT_VERIFIED' },
    ];

    // Suggested development horizons: generic guidance, labelled as such.
    const roadmaps = {
      immediate_3_to_6m: {
        horizon: '3–6 Months',
        focus: significantGaps.length > 0 ? `Close top measured gaps: ${significantGaps.slice(0, 2).join(', ')}` : (assessed ? 'Consolidate strengths at target level' : 'Record skill ratings to identify gaps'),
        deliverables: ['Author and present a technical RFC', 'Pair with a Staff engineer on quarterly architecture reviews'],
      },
      medium_6_to_18m: {
        horizon: '6–18 Months',
        focus: 'Expand cross-team technical leadership and mentorship',
        deliverables: ['Mentor 1–2 engineers', 'Act as incident commander on the on-call rotation'],
      },
      long_term_1_to_3y: {
        horizon: '1–3 Years',
        focus: track === 'ENGINEERING_MANAGEMENT' ? 'Engineering Management Mastery (M1 ➔ M2)' : 'Staff IC Domain Leadership (L6 ➔ L7)',
        deliverables: [track === 'ENGINEERING_MANAGEMENT'
          ? 'Scale the team, lead hiring, and own quarterly OKR delivery'
          : 'Set org-wide architectural standards and a multi-year platform strategy'],
      },
    };

    const fmt = (v, unit) => (v === null ? 'not measured' : `${v}${unit}`);
    const readinessText = readinessScore === null ? 'not assessed (no skill ratings recorded)' : `${readinessScore}% (${readinessVerdict.replace(/_/g, ' ')})`;
    const notionDocs = Array.isArray(notionData.career_docs) ? notionData.career_docs : [];

    if (mode === 'DRILL_DOWN') {
      const drillSummary = `### 🎯 Skill Gap & Career Growth Breakdown: ${subject} (${currentLevel} ➔ ${targetLevel})\n\n` +
        `- **Promotion Readiness**: **${readinessText}**\n` +
        `- **Top Growth Gaps**:\n` +
        (significantGaps.length > 0
          ? significantGaps.map((g) => `  - **${g}** against ${targetLevel} requirements`).join('\n')
          : assessed ? '  - 🟢 All assessed dimensions meet the target level.' : '  - Skill ratings are not recorded. Add them in **Admin → Team**.') +
        `\n- **Suggested 3–6 month focus**: ${roadmaps.immediate_3_to_6m.focus}`;
      return {
        mode: 'DRILL_DOWN',
        engineer_id: member?.id || inputArgs.engineer_id || null,
        current_level: currentLevel,
        target_level: targetLevel,
        readiness_score: readinessScore,
        readiness_verdict: readinessVerdict,
        significant_gaps: significantGaps,
        summary: drillSummary,
      };
    }

    const radarRows = competencyRadar.map((r) => `| **${r.dimension}** | ${r.current === null ? '—' : `${r.current} / 5`} | ${r.target === null ? '—' : `${r.target} / 5`} | ${r.status === 'MET' ? '✅ Met' : r.status === 'MINOR_GAP' ? '⚠️ Minor Gap' : r.status === 'MAJOR_GAP' ? '❌ Major Gap' : '— Not assessed'} | ${r.gap === null ? '—' : r.gap > 0 ? `-${r.gap}` : '0.0'} |`);
    const eventLines = events.length > 0
      ? events.map((ev) => `  * 📅 **${ev.start_time || ev.start?.dateTime || 'unknown time'}**: ${ev.summary || 'Untitled event'}`).join('\n')
      : '  * No calendar data available (connect Google Calendar).';

    const summaryText = `### 🎯 Promotion Readiness Scorecard: ${subject} (${currentLevel} ➔ ${targetLevel})

> **Track**: ${track === 'ENGINEERING_MANAGEMENT' ? 'Management (M1/M2)' : 'Individual Contributor (IC)'} | **Tenure**: ${tenureMonths === null ? 'not recorded' : `${tenureMonths} months`} | **Promotion Readiness**: **${readinessText}** | **Burnout Risk**: ${burnoutRisk === 'UNKNOWN' ? 'unknown (no workload data)' : burnoutRisk}

| Metric | Measured Value | Requirement | Status |
| :--- | :--- | :--- | :--- |
| **Promotion Readiness** | **${readinessScore === null ? 'not assessed' : `${readinessScore}%`}** | ≥ 90% (Ready) | ${readinessScore === null ? '— Record skill ratings' : readinessScore >= 90 ? '🟢 Ready' : readinessScore >= 75 ? '🟡 On Track' : '🔴 Developing'} |
| **Weekly Workload** | **${fmt(workloadHours, ' hrs/wk')}** | ≤ 44 hrs/wk | ${workloadHours === null ? '— Not measured' : workloadHours <= 44 ? '🟢 Sustainable' : '🟡 Elevated'} |
| **Weekly Meetings** | **${fmt(meetingHours, ' hrs/wk')}** | ≤ 16 hrs/wk | ${meetingHours === null ? '— Not measured' : meetingHours <= 16 ? '🟢 Sustainable' : '🟡 Elevated'} |
| **Significant Skill Gaps** | **${assessed ? (significantGaps.length > 0 ? significantGaps.join(', ') : 'None') : 'not assessed'}** | 0 major gaps | ${!assessed ? '— Not assessed' : significantGaps.length === 0 ? '🟢 None' : '⚠️ Action Required'} |

<details>
<summary><b>📊 12-Dimension Competency Radar & Gap Analysis</b></summary>

| Competency Dimension | Current | Target (${targetLevel}) | Status | Gap |
| :--- | :---: | :---: | :---: | :---: |
${radarRows.join('\n')}

- **Prerequisites to verify** (not checked automatically):
${prerequisites.map((p) => `- [ ] ${p.name}`).join('\n')}

</details>

<details>
<summary><b>🗺️ Suggested Development Horizons (generic guidance)</b></summary>

- **3–6 months**: ${roadmaps.immediate_3_to_6m.focus}
- **6–18 months**: ${roadmaps.medium_6_to_18m.focus}
- **1–3 years**: ${roadmaps.long_term_1_to_3y.focus}

</details>

<details>
<summary><b>📅 Google Calendar 1-on-1 Sync</b></summary>

${eventLines}
${notionDocs.length > 0 ? `\n**Notion career notes**:\n${notionDocs.map((d) => `- [${d.title}](${d.url})`).join('\n')}` : ''}

</details>
`;

    return {
      mode: 'ANALYZE',
      engineer_id: member?.id || inputArgs.engineer_id || null,
      current_level: currentLevel,
      target_level: targetLevel,
      track,
      tenure_months: tenureMonths,
      metrics: {
        promotion_readiness_score: readinessScore,
        promotion_verdict: readinessVerdict,
        burnout_risk_score: burnoutRisk,
        weekly_workload_hours: workloadHours,
        weekly_meeting_hours: meetingHours,
        skills_assessed: assessed,
      },
      competency_radar: competencyRadar,
      skill_matrix_gaps: significantGaps,
      prerequisites,
      roadmaps,
      today_schedule: events,
      summary: summaryText,
    };
  },
});

export function createPeopleAgent(customTools = null, options = {}) {
  return createMicroAgent({
    name: options.name || 'people_agent',
    defaultTool: peopleGrowthTool,
    promptTemplate: peopleAgentPromptTemplate,
    customTools,
    options,
  });
}

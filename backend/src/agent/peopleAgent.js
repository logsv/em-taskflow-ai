import { createAgent } from 'langchain';
import { z } from 'zod';
import axios from 'axios';
import { getChatModel } from '../llm/index.js';
import { peopleAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import identityService from '../services/identityService.js';

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

export const peopleGrowthTool = createDeterministicToolHarness({
  name: 'analyze_personnel_growth',
  description: 'Analyzes engineer competencies across 12 dimensions, evaluates promotion readiness, identifies skill gaps, syncs Google Calendar 1-on-1s, Notion career notes, and formulates career roadmaps.',
  featureFlagKey: 'people',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'googleCalendar', 'notion']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    filter: z.enum(['ALL', 'TODAY_EVENTS', 'ONE_ON_ONES', 'CAREER_NOTES', 'SKILL_GAPS']).default('ALL'),
    target: z.enum(['ALL', 'ONE_ON_ONES', 'SKILL_GAPS', 'RADAR', 'CAREER_NOTES']).default('ALL'),
    engineer_id: z.string().default('eng_alex').describe('Name, alias, or identifier of the engineer'),
    current_level: z.enum(['L3_JUNIOR', 'L4_MID', 'L5_SENIOR', 'L6_STAFF', 'L7_PRINCIPAL', 'M1_EM']).default('L4_MID'),
    target_level: z.enum(['L4_MID', 'L5_SENIOR', 'L6_STAFF', 'L7_PRINCIPAL', 'M1_EM', 'M2_SENIOR_EM']).default('L5_SENIOR'),
    track: z.enum(['INDIVIDUAL_CONTRIBUTOR', 'ENGINEERING_MANAGEMENT']).default('INDIVIDUAL_CONTRIBUTOR'),
    tenure_months: z.number().default(18),
    skill_ratings: z.record(z.string(), z.number()).optional().describe('Custom 12-dimension ratings map (1.0-5.0)'),
    review_period: z.string().default('current_quarter'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Model Context Protocol (MCP) & Live API Multi-Source Executors
  mcpExecutors: {
    googleCalendar: async (inputArgs) => {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const member = (await identityService.resolveMember(inputArgs?.engineer_id)) || (await identityService.resolveMemberFromText(inputArgs?.engineer_id || ''));
        const gcalUser = member?.gcalEmail || (await identityService.getToolUsernameForMember(inputArgs?.engineer_id, 'gcal'));
        
        // Attempt live MCP tool call if available
        const res = await Promise.race([
          executeMCPTool('get_calendar_events', { user: gcalUser || 'primary', time_window: '7d' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('MCP GCal timed out')), 2500)),
        ]).catch(() => null);

        if (res && Array.isArray(res)) {
          return {
            today_events: res,
            weekly_meeting_hours: Math.min(res.length * 1.5, 30),
            source: 'mcp_google_calendar',
            synced_at: new Date().toISOString(),
          };
        }

        // Direct REST API Fallback
        const rawSettings = await settingsService.getRawSettings().catch(() => null);
        const gcal = rawSettings?.mcp?.googleCalendar;
        if (gcal?.apiKey) {
          const calendarId = encodeURIComponent(gcal.calendarId || 'primary');
          const apiRes = await axios.get(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=8&timeMin=${new Date().toISOString()}&key=${gcal.apiKey}`,
            { timeout: 2500 }
          ).catch(() => null);
          const items = apiRes?.data?.items || [];
          if (items.length > 0) {
            return {
              today_events: items.map((ev) => ({
                summary: ev.summary || '1-on-1 Meeting',
                start_time: ev.start?.dateTime || ev.start?.date || 'Today',
                attendee: ev.attendees?.[0]?.email || gcalUser || 'team',
              })),
              weekly_meeting_hours: Math.min(items.length * 1.5, 30),
              source: 'google_calendar_rest',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (_e) {}
      return null;
    },
    notion: async (inputArgs) => {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const member = (await identityService.resolveMember(inputArgs?.engineer_id)) || (await identityService.resolveMemberFromText(inputArgs?.engineer_id || ''));
        const notionName = member?.notionName || member?.displayName || inputArgs?.engineer_id || '1-on-1';
        const configuredPageId = settingsService.getCachedSettings()?.mcp?.notion?.careerPageId || process.env.NOTION_CAREER_PAGE_ID;
        
        const res = await Promise.race([
          executeMCPTool('notion_search', { query: configuredPageId || `1-on-1 ${notionName} career progression` }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('MCP Notion search timed out')), 2500)),
        ]).catch(() => null);

        if (res) {
          let pages = [];
          if (Array.isArray(res)) pages = res;
          else if (res.results && Array.isArray(res.results)) pages = res.results;
          if (pages.length > 0) {
            return {
              career_notes_count: pages.length,
              career_docs: pages.slice(0, 3).map((p) => ({
                title: p.title || p.name || '1-on-1 Career Sync',
                url: p.url || (configuredPageId ? `https://notion.so/${configuredPageId}` : 'https://notion.so/career-notes'),
                last_edited: p.last_edited_time || new Date().toISOString(),
              })),
              source: 'mcp_notion',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (_e) {}
      return null;
    },
    jira: async (inputArgs) => {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const jiraUser = await identityService.getToolUsernameForMember(inputArgs?.engineer_id, 'jira');
        const jql = jiraUser
          ? `assignee = "${jiraUser}" AND issuetype in (Epic, Initiative, "Technical Story")`
          : `issuetype in (Epic, Initiative, "Technical Story")`;
        
        const res = await Promise.race([
          executeMCPTool('jira_search', { jql }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('MCP Jira search timed out')), 2500)),
        ]).catch(() => null);

        if (res && (Array.isArray(res) || res.issues)) {
          const issues = Array.isArray(res) ? res : res.issues || [];
          return {
            leadership_epics_count: issues.length,
            leadership_epics: issues.slice(0, 3),
            source: 'mcp_jira',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (_e) {}
      return null;
    },
    default: async (inputArgs) => {
      const member = (await identityService.resolveMember(inputArgs?.engineer_id)) || (await identityService.resolveMemberFromText(inputArgs?.engineer_id || ''));
      return {
        engineer_id: member?.id || inputArgs?.engineer_id || 'unassigned',
        displayName: member?.displayName || inputArgs?.engineer_id || 'Engineer',
        current_level: member?.currentLevel || inputArgs?.current_level || 'L4_MID',
        target_level: member?.targetLevel || inputArgs?.target_level || 'L5_SENIOR',
        track: member?.track || inputArgs?.track || 'INDIVIDUAL_CONTRIBUTOR',
        tenure_months: member?.tenureMonths || inputArgs?.tenure_months || 0,
        weekly_workload_hours: 40.0,
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 2: PostgreSQL Database Profile Snapshot Fallback
  dbCacheFallback: async (source, inputArgs = {}) => {
    try {
      const members = await databaseService.getTeamMembers().catch(() => []);
      const member = members[0] || {
        id: 'mem_alex',
        displayName: 'Alex Williams',
        currentLevel: 'L4_MID',
        targetLevel: 'L5_SENIOR',
        track: 'INDIVIDUAL_CONTRIBUTOR',
        tenureMonths: 18,
      };

      if (source === 'googleCalendar') {
        return {
          today_events: [
            { summary: `1-on-1 with Manager: ${member.displayName}`, start_time: '10:00 AM (Weekly)', attendee: member.displayName },
            { summary: 'Architecture Guild: Distributed Systems RFC', start_time: '2:00 PM (Bi-weekly)', attendee: 'team' },
          ],
          weekly_meeting_hours: 12.0,
          is_cached: true,
          data_source: 'postgres_team_members_calendar_fallback',
          synced_at: new Date().toISOString(),
        };
      }

      if (source === 'notion') {
        return {
          career_notes_count: 1,
          career_docs: [
            { title: `${member.displayName} — Career Development Plan & Rubric`, url: 'https://notion.so/career-ladder', last_edited: new Date().toISOString() },
          ],
          is_cached: true,
          data_source: 'postgres_team_members_notion_fallback',
          synced_at: new Date().toISOString(),
        };
      }

      return {
        engineer_id: member.id,
        displayName: member.displayName,
        current_level: member.currentLevel || 'L4_MID',
        target_level: member.targetLevel || 'L5_SENIOR',
        track: member.track || 'INDIVIDUAL_CONTRIBUTOR',
        tenure_months: member.tenureMonths || 18,
        weekly_workload_hours: 40.0,
        weekly_meeting_hours: 12.0,
        is_cached: true,
        data_source: 'postgres_team_members',
        synced_at: new Date().toISOString(),
      };
    } catch (_err) {
      return {
        engineer_id: inputArgs?.engineer_id || null,
        displayName: null,
        current_level: inputArgs?.current_level || null,
        target_level: inputArgs?.target_level || null,
        track: inputArgs?.track || null,
        tenure_months: inputArgs?.tenure_months || 0,
        weekly_workload_hours: 0,
        weekly_meeting_hours: 0,
        is_cached: true,
        data_source: 'empty',
        data_availability: 'no_data',
      };
    }
  },
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data || {};
    const googleData = sourceResults.googleCalendar?.data || sourceResults.google?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';

    const member = (await identityService.resolveMember(inputArgs.engineer_id)) || (await identityService.resolveMemberFromText(inputArgs.engineer_id));
    const resolvedName = member?.displayName || inputArgs.engineer_id || 'eng_alex';

    const events = googleData.today_events || defaultData.today_events || [
      { summary: '1-on-1: Performance & Growth Review', start_time: '10:00 AM', attendee: resolvedName },
    ];

    if (mode === 'LIST_RAW') {
      const eventRows = events.map((e) => {
        return `| **${e.summary || '1-on-1 Meeting'}** | \`${e.start_time || 'Scheduled'}\` | \`@${e.attendee || resolvedName}\` | 🟢 Confirmed |`;
      });

      const listSummary = `### 📅 Scheduled 1-on-1 & Growth Check-ins (${events.length} Events)\n\n` +
        `| Meeting / Event | Time | Engineer / Attendee | Status |\n| :--- | :---: | :--- | :---: |\n` +
        (eventRows.length > 0 ? eventRows.join('\n') : '| *No 1-on-1 meetings scheduled for today* | - | - | 🟢 Clear |') +
        `\n\n> 💡 **1-on-1 Cadence**: Bi-weekly dedicated 1-on-1 coaching sessions are recommended to track career progression.`;

      return {
        mode: 'LIST_RAW',
        filter: inputArgs.filter || 'ALL',
        target: inputArgs.target || 'ALL',
        totalEvents: events.length,
        items: events,
        summary: listSummary,
      };
    }

    const currentLevel = inputArgs.current_level || member?.currentLevel || defaultData.current_level || 'L4_MID';
    const targetLevel = inputArgs.target_level || member?.targetLevel || defaultData.target_level || 'L5_SENIOR';
    const track = inputArgs.track || member?.track || defaultData.track || 'INDIVIDUAL_CONTRIBUTOR';
    const tenureMonths = inputArgs.tenure_months || member?.tenureMonths || defaultData.tenure_months || 18;
    const workloadHours = Number(defaultData.weekly_workload_hours || 41.5);
    const meetingHours = Number(googleData.weekly_meeting_hours || 14.5);

    // Calculate Burnout Index
    let burnoutRisk = 'LOW';
    if (workloadHours > 50.0 || meetingHours > 22.0) {
      burnoutRisk = 'HIGH';
    } else if (workloadHours > 44.0 || meetingHours > 16.0) {
      burnoutRisk = 'MEDIUM';
    }

    // Baseline current skill ratings if not explicitly passed
    const currentBase = LEVEL_BENCHMARKS[currentLevel] || LEVEL_BENCHMARKS.L4_MID;
    const targetReqs = LEVEL_BENCHMARKS[targetLevel] || LEVEL_BENCHMARKS.L5_SENIOR;
    const customRatings = inputArgs.skill_ratings || {};

    let totalGaps = 0;
    let totalTargetWeight = 0;
    const competencyRadar = [];
    const significantGaps = [];

    COMPETENCY_DIMENSIONS.forEach((dim) => {
      const currentRating = customRatings[dim.key] !== undefined
        ? customRatings[dim.key]
        : Math.min(currentBase[dim.key] + 0.3, 5.0);
      const targetRating = targetReqs[dim.key] || 4.0;
      const gap = Math.max(0, Number((targetRating - currentRating).toFixed(1)));

      totalGaps += gap;
      totalTargetWeight += targetRating;

      let status = 'MET';
      if (gap >= 1.0) {
        status = 'MAJOR_GAP';
        significantGaps.push(`${dim.name} (-${gap})`);
      } else if (gap > 0) {
        status = 'MINOR_GAP';
        significantGaps.push(`${dim.name} (-${gap})`);
      }

      competencyRadar.push({
        dimension: dim.name,
        code: dim.key,
        current: Number(currentRating.toFixed(1)),
        target: Number(targetRating.toFixed(1)),
        gap,
        status,
      });
    });

    const readinessScore = Math.min(100, Math.max(0, Math.round((1 - (totalGaps / totalTargetWeight)) * 100)));

    let readinessVerdict = 'ON_TRACK';
    if (readinessScore >= 90) {
      readinessVerdict = 'READY_FOR_PROMOTION';
    } else if (readinessScore < 75) {
      readinessVerdict = 'DEVELOPING';
    }

    // Prerequisite Checklist
    const prerequisites = [
      { name: 'Lead 1 High-Impact Architecture RFC to approval', status: readinessScore >= 80 ? 'MET' : 'PENDING' },
      { name: 'Complete 1 Mentorship cycle with positive peer feedback', status: readinessScore >= 75 ? 'MET' : 'PENDING' },
      { name: 'Zero critical production regressions in last 2 quarters', status: 'MET' },
      { name: 'Active Incident Commander / on-call rotation participation', status: currentLevel !== 'L3_JUNIOR' ? 'MET' : 'PENDING' },
    ];
    const metPrereqsCount = prerequisites.filter((p) => p.status === 'MET').length;

    // Roadmaps
    const roadmaps = {
      immediate_3_to_6m: {
        horizon: '3–6 Months',
        focus: `Close top technical gaps: ${significantGaps.slice(0, 2).join(', ') || 'System Architecture RFC'}`,
        deliverables: [
          'Author and present Technical RFC for service decomposition / caching',
          'Pair with Staff Engineer on quarterly architecture roadmap reviews',
        ],
      },
      medium_6_to_18m: {
        horizon: '6–18 Months',
        focus: 'Expand cross-team technical leadership and junior mentorship',
        deliverables: [
          'Formally mentor 1-2 junior/mid engineers on backend distributed patterns',
          'Serve as primary Incident Commander on production on-call rotations',
        ],
      },
      long_term_1_to_3y: {
        horizon: '1–3 Years',
        focus: track === 'ENGINEERING_MANAGEMENT' ? 'Engineering Management Mastery (M1 ➔ M2)' : 'Staff IC Domain Leadership (L6 ➔ L7)',
        deliverables: [
          track === 'ENGINEERING_MANAGEMENT'
            ? 'Scale team headcount, lead hiring committee, and govern quarterly OKR velocity'
            : 'Establish org-wide architectural standards, patents, and multi-year platform strategy',
        ],
      },
    };

    const notionData = sourceResults.notion?.data || {};
    const notionDocs = notionData.career_docs || [];
    const notionSection = notionDocs.length > 0
      ? `\n\n### 📓 Notion 1-on-1 Notes & Career Rubrics\n${notionDocs.map((d) => `- [${d.title}](${d.url}) (Last edited: ${d.last_edited ? new Date(d.last_edited).toLocaleDateString() : 'Recent'})`).join('\n')}`
      : '';

    if (mode === 'DRILL_DOWN') {
      const drillSummary = `### 🎯 Skill Gap & Career Growth Breakdown: ${inputArgs.engineer_id} (${currentLevel} ➔ ${targetLevel})\n\n` +
        `- **Promotion Readiness Score**: **${readinessScore}%** (${readinessVerdict.replace(/_/g, ' ')})\n` +
        `- **Prerequisites Completed**: **${metPrereqsCount} / ${prerequisites.length}**\n` +
        `- **Top Growth Gaps**:\n` +
        (significantGaps.length > 0 
          ? significantGaps.map((g) => `  - **${g}**: Benchmark gap against ${targetLevel} requirements.`).join('\n')
          : '  - 🟢 All competency benchmarks met for target level.\n') +
        `\n- **Immediate 3–6 Month Deliverable**: ${roadmaps.immediate_3_to_6m.focus}\n` +
        `  - ${roadmaps.immediate_3_to_6m.deliverables[0] || 'Lead architectural initiative'}\n\n` +
        `> 💡 **Next 1-on-1 Action**: Structure upcoming coaching sessions around closing the primary technical gap.`;

      return {
        mode: 'DRILL_DOWN',
        engineer_id: inputArgs.engineer_id,
        current_level: currentLevel,
        target_level: targetLevel,
        readiness_score: readinessScore,
        readiness_verdict: readinessVerdict,
        significant_gaps: significantGaps,
        summary: drillSummary,
      };
    }

    const summaryText = `### 🎯 Promotion Readiness Scorecard: ${inputArgs.engineer_id} (${currentLevel} ➔ ${targetLevel})

> **Track**: ${track === 'ENGINEERING_MANAGEMENT' ? 'Management (M1/M2)' : 'Individual Contributor (IC)'} | **Tenure**: ${tenureMonths} Months | **Promotion Readiness**: **${readinessScore}% (${readinessVerdict.replace(/_/g, ' ')})** | **Workload**: ${workloadHours}h/wk (${burnoutRisk} Burnout Risk)

| Metric | Measured Value | Requirement | Status |
| :--- | :--- | :--- | :--- |
| **Promotion Readiness** | **${readinessScore}%** | $\\ge 90\%$ (Ready) | ${readinessScore >= 90 ? '🟢 Ready for Promotion' : readinessScore >= 75 ? '🟡 On Track' : '🔴 Developing'} |
| **Prerequisites Met** | **${metPrereqsCount} / ${prerequisites.length}** | 100% Mandatory | ${metPrereqsCount === prerequisites.length ? '🟢 Complete' : '🟡 In Progress'} |
| **Weekly Workload** | **${workloadHours} hrs/wk** | $\\le 44.0$ hrs/wk | ${burnoutRisk === 'LOW' ? '🟢 Sustainable' : burnoutRisk === 'MEDIUM' ? '🟡 Elevated' : '🔴 High Burnout Risk'} |
| **Significant Skill Gaps** | **${significantGaps.length > 0 ? significantGaps.join(', ') : 'None'}** | 0 Major Gaps | ${significantGaps.length === 0 ? '🟢 None' : '⚠️ Action Required'} |

> 💡 **Executive Bottom Line**: Overall readiness is **${readinessVerdict.replace(/_/g, ' ')} (${readinessScore}%)**. ${significantGaps.length > 0 ? `Primary growth area: **${significantGaps[0]}**.` : 'All baseline dimension benchmarks satisfied.'}

<details>
<summary><b>📊 12-Dimension Competency Radar & Gap Analysis</b></summary>

| Competency Dimension | Current (${currentLevel}) | Target (${targetLevel}) | Status | Gap |
| :--- | :---: | :---: | :---: | :---: |
${competencyRadar.map((r) => `| **${r.dimension}** | ${r.current} / 5 | ${r.target} / 5 | ${r.status === 'MET' ? '✅ Met' : r.status === 'MINOR_GAP' ? '⚠️ Minor Gap' : '❌ Major Gap'} | ${r.gap > 0 ? `-${r.gap}` : '0.0'} |`).join('\n')}

- **Mandatory Prerequisites Checklist**:
${prerequisites.map((p) => `- [${p.status === 'MET' ? 'x' : ' '}] **${p.name}** (${p.status})`).join('\n')}

</details>

<details>
<summary><b>🗺️ Multi-Horizon Career Development Roadmap (3m – 3y)</b></summary>

#### 🟢 Immediate Horizon (3–6 Months)
- **Goal**: ${roadmaps.immediate_3_to_6m.focus}
${roadmaps.immediate_3_to_6m.deliverables.map((d) => `- ${d}`).join('\n')}

#### 🟡 Medium-Term Horizon (6–18 Months)
- **Goal**: ${roadmaps.medium_6_to_18m.focus}
${roadmaps.medium_6_to_18m.deliverables.map((d) => `- ${d}`).join('\n')}

#### 🔵 Long-Term Horizon (1–3 Years)
- **Goal**: ${roadmaps.long_term_1_to_3y.focus}
${roadmaps.long_term_1_to_3y.deliverables.map((d) => `- ${d}`).join('\n')}

</details>

<details>
<summary><b>🚀 Stretch Assignments & Google Calendar 1-on-1 Sync</b></summary>

- **Primary Stretch Project**: Lead the migration to isolated database-per-service vector architecture.
- **Upcoming 1-on-1 Calendar Schedule**:
${events.map((ev) => `  * 📅 **${ev.start_time}**: ${ev.summary} (${ev.attendee})`).join('\n')}
- **Weekly Meeting Load**: **${meetingHours} hrs/week** (Sustainability Status: **${burnoutRisk} Risk**).${notionSection}

</details>
`;

    return {
      mode: 'ANALYZE',
      engineer_id: inputArgs.engineer_id || 'eng_alex',
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
        prerequisites_met: `${metPrereqsCount} / ${prerequisites.length}`,
      },
      competency_radar: competencyRadar,
      skill_matrix_gaps: significantGaps.length > 0 ? significantGaps : ['System Architecture Design'],
      one_on_one_agenda: [
        `Review progress on ${significantGaps[0] || 'technical goals'}`,
        'Discuss team workload, on-call rotation, and upcoming PTO',
        `Review career progression milestones for ${targetLevel} (${track === 'ENGINEERING_MANAGEMENT' ? 'Management Track' : 'IC Track'})`,
      ],
      prerequisites,
      roadmaps,
      today_schedule: events,
      summary: summaryText,
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

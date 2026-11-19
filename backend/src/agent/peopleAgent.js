import axios from 'axios';
import { z } from 'zod';
import { peopleAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import identityService from '../services/identityService.js';
import googleCalendarClient from '../integrations/clients/GoogleCalendarClient.js';
import { createMicroAgent, safeExecuteMCPTool, resolveMemberTarget } from './baseAgent.js';
import { warn } from '../utils/logger.js';

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
 * Keeps only real, in-range (1.0–5.0) ratings for known competency dimensions.
 * Returns an empty object when no usable ratings exist — callers must treat that as UNSCORED.
 */
export function normalizeSkillRatings(raw) {
  const ratings = {};
  if (!raw || typeof raw !== 'object') return ratings;
  const validKeys = new Set(COMPETENCY_DIMENSIONS.map((d) => d.key));
  for (const [key, value] of Object.entries(raw)) {
    const code = String(key).trim().toUpperCase();
    const num = Number(value);
    if (validKeys.has(code) && value !== null && value !== '' && Number.isFinite(num) && num >= 1 && num <= 5) {
      ratings[code] = num;
    }
  }
  return ratings;
}

// Meeting load is measured over the next 7 days of calendar events.
export const MEETING_HOURS_WINDOW_DAYS = 7;
const CALENDAR_MAX_RESULTS = 250;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const pickEventTime = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value.dateTime || value.date || null;
  return String(value);
};

/**
 * Normalizes a Google Calendar event from either the MCP tool shape ({ start, end, attendees: [email] })
 * or the REST API shape ({ start: { dateTime }, end: { dateTime }, attendees: [{ email }] }).
 * Missing fields stay null; nothing is invented.
 */
export function normalizeCalendarEvent(ev, fallbackAttendee = null) {
  const attendees = Array.isArray(ev?.attendees)
    ? ev.attendees.map((a) => (typeof a === 'string' ? a : (a?.email || a?.displayName))).filter(Boolean)
    : [];
  return {
    summary: ev?.summary || '(untitled event)',
    start_time: pickEventTime(ev?.start_time ?? ev?.start),
    end_time: pickEventTime(ev?.end_time ?? ev?.end),
    attendee: ev?.attendee || attendees[0] || fallbackAttendee || null,
    status: ev?.status || null,
  };
}

/**
 * Sums the real durations of timed events. All-day (date-only), cancelled, or events
 * without a valid start/end are excluded and counted as untimed.
 * Returns `hours: null` when there are events but none has a measurable duration.
 */
export function computeMeetingHours(events = []) {
  let totalMs = 0;
  let timedCount = 0;
  let untimedCount = 0;
  for (const ev of events) {
    if (ev?.status === 'cancelled') continue;
    const start = ev?.start_time;
    const end = ev?.end_time;
    if (!start || !end || DATE_ONLY_RE.test(start) || DATE_ONLY_RE.test(end)) {
      untimedCount += 1;
      continue;
    }
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      untimedCount += 1;
      continue;
    }
    totalMs += endMs - startMs;
    timedCount += 1;
  }
  const hours = timedCount > 0 || untimedCount === 0
    ? Number((totalMs / 3600000).toFixed(1))
    : null;
  return { hours, timedCount, untimedCount };
}

/**
 * Builds the calendar source payload from real events. An empty list from a configured
 * calendar is a measured zero, not missing data.
 */
export function buildCalendarSourceResult(rawEvents, { source, fallbackAttendee = null, maxResults = CALENDAR_MAX_RESULTS } = {}) {
  const events = (Array.isArray(rawEvents) ? rawEvents : []).map((ev) => normalizeCalendarEvent(ev, fallbackAttendee));
  const { hours, timedCount, untimedCount } = computeMeetingHours(events);
  return {
    today_events: events,
    weekly_meeting_hours: hours,
    meeting_hours_basis: {
      method: 'sum_of_event_durations',
      window_days: MEETING_HOURS_WINDOW_DAYS,
      timed_events: timedCount,
      untimed_events_excluded: untimedCount,
      // Hitting the page limit means more events may exist, so hours are a lower bound.
      truncated: events.length >= maxResults,
    },
    source,
    synced_at: new Date().toISOString(),
  };
}

const isCalendarConfigured = () => {
  try {
    return Boolean(googleCalendarClient.getCredentials().apiKey);
  } catch (_err) {
    return false;
  }
};

const parseToolArray = (res) => {
  if (Array.isArray(res)) return res;
  if (typeof res === 'string') {
    try {
      const parsed = JSON.parse(res);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_err) {
      return null;
    }
  }
  return null;
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
    engineer_id: z.string().optional().describe('Name, alias, or identifier of the engineer (required to resolve a profile; never defaulted)'),
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
        // The calendar client returns "[]" when no credentials exist, which would be indistinguishable
        // from a configured calendar with no meetings. Treat an unconfigured calendar as not connected.
        if (!isCalendarConfigured()) return null;

        const { executeMCPTool } = await import('../mcp/index.js');
        const member = inputArgs?.engineer_id
          ? ((await identityService.resolveMember(inputArgs.engineer_id)) || (await identityService.resolveMemberFromText(inputArgs.engineer_id)))
          : null;
        const gcalUser = member?.gcalEmail
          || (inputArgs?.engineer_id ? await identityService.getToolUsernameForMember(inputArgs.engineer_id, 'gcal') : null);

        // Live MCP tool call (returns a JSON string of events, or an error object on failure).
        const res = await Promise.race([
          executeMCPTool('get_calendar_events', {
            user: gcalUser || 'primary',
            time_window: `${MEETING_HOURS_WINDOW_DAYS}d`,
            max_results: CALENDAR_MAX_RESULTS,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('MCP GCal timed out')), 2500)),
        ]).catch(() => null);

        const mcpEvents = parseToolArray(res);
        if (mcpEvents) {
          return buildCalendarSourceResult(mcpEvents, { source: 'mcp_google_calendar', fallbackAttendee: gcalUser });
        }

        // Direct REST API Fallback over the same 7-day window.
        const rawSettings = settingsService.getCachedRawSettings ? settingsService.getCachedRawSettings() : (settingsService.getCachedSettings ? settingsService.getCachedSettings() : null);
        const gcal = rawSettings?.mcp?.googleCalendar;
        if (gcal?.apiKey) {
          const calendarId = encodeURIComponent(gcal.calendarId || 'primary');
          const now = new Date();
          const timeMax = new Date(now.getTime() + MEETING_HOURS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
          const apiRes = await axios.get(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
            {
              params: {
                maxResults: CALENDAR_MAX_RESULTS,
                singleEvents: true,
                orderBy: 'startTime',
                timeMin: now.toISOString(),
                timeMax: timeMax.toISOString(),
                key: gcal.apiKey,
              },
              timeout: 2500,
            }
          ).catch(() => null);
          if (apiRes && Array.isArray(apiRes.data?.items)) {
            return buildCalendarSourceResult(apiRes.data.items, { source: 'google_calendar_rest', fallbackAttendee: gcalUser });
          }
        }
      } catch (err) {
        warn({ module: 'peopleHarness', action: 'calendarExecutor', err: err.message }, 'Calendar executor notice');
      }
      return null;
    },
    notion: async (inputArgs) => {
      try {
        const { displayName } = await resolveMemberTarget(inputArgs?.engineer_id);
        const configuredPageId = settingsService.getCachedSettings()?.mcp?.notion?.careerPageId || process.env.NOTION_CAREER_PAGE_ID;
        
        const res = await safeExecuteMCPTool('notion_search', {
          query: configuredPageId || `1-on-1 ${displayName} career progression`,
        });

        if (res) {
          const pages = Array.isArray(res) ? res : (Array.isArray(res.results) ? res.results : []);
          if (pages.length > 0) {
            return {
              career_notes_count: pages.length,
              career_docs: pages.slice(0, 3).map((p) => ({
                title: p.title || p.name || '(untitled page)',
                url: p.url || null,
                last_edited: p.last_edited_time || null,
              })),
              source: 'mcp_notion',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (err) {
        warn({ module: 'peopleHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    jira: async (inputArgs) => {
      try {
        const { toolUsername } = await resolveMemberTarget(inputArgs?.engineer_id, 'jira');
        const jql = toolUsername && toolUsername !== 'unassigned'
          ? `assignee = "${toolUsername}" AND issuetype in (Epic, Initiative, "Technical Story")`
          : `issuetype in (Epic, Initiative, "Technical Story")`;
        
        const res = await safeExecuteMCPTool('jira_search', { jql });

        if (res) {
          const issues = Array.isArray(res) ? res : (Array.isArray(res.issues) ? res.issues : []);
          return {
            leadership_epics_count: issues.length,
            leadership_epics: issues.slice(0, 3),
            source: 'mcp_jira',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'peopleHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const member = (await identityService.resolveMember(inputArgs?.engineer_id)) || (await identityService.resolveMemberFromText(inputArgs?.engineer_id || ''));
      return {
        engineer_id: member?.id || inputArgs?.engineer_id || null,
        displayName: member?.displayName || null,
        current_level: member?.currentLevel || inputArgs?.current_level || 'L4_MID',
        target_level: member?.targetLevel || inputArgs?.target_level || 'L5_SENIOR',
        track: member?.track || inputArgs?.track || 'INDIVIDUAL_CONTRIBUTOR',
        tenure_months: member?.tenureMonths || inputArgs?.tenure_months || 0,
        // No connected source tracks worked hours; never assume a standard week.
        weekly_workload_hours: null,
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 2: PostgreSQL Database Profile Snapshot Fallback
  // Tier 2: PostgreSQL Database Profile Snapshot Fallback.
  // Only the team member profile is persisted in PostgreSQL. Calendar, Notion and Jira have no
  // cached snapshot table, so their fallbacks return explicit not-connected empty states
  // (Zero Misleading Fallbacks) instead of invented events, documents or meeting hours.
  dbCacheFallback: async (source, inputArgs = {}) => {
    const syncedAt = new Date().toISOString();

    if (source === 'googleCalendar' || source === 'google') {
      return {
        today_events: [],
        weekly_meeting_hours: null,
        is_cached: true,
        data_source: 'none',
        data_availability: 'not_connected',
        source_status: 'Google Calendar is not connected — no live or cached calendar data available.',
        synced_at: syncedAt,
      };
    }

    if (source === 'notion') {
      return {
        career_notes_count: 0,
        career_docs: [],
        is_cached: true,
        data_source: 'none',
        data_availability: 'not_connected',
        source_status: 'Notion is not connected — no live or cached career notes available.',
        synced_at: syncedAt,
      };
    }

    if (source === 'jira') {
      return {
        leadership_epics_count: 0,
        leadership_epics: [],
        is_cached: true,
        data_source: 'none',
        data_availability: 'not_connected',
        source_status: 'Jira is not connected — no live or cached leadership epics available.',
        synced_at: syncedAt,
      };
    }

    const noProfile = {
      engineer_id: inputArgs?.engineer_id || null,
      displayName: null,
      current_level: null,
      target_level: null,
      track: null,
      tenure_months: null,
      weekly_workload_hours: null,
      weekly_meeting_hours: null,
      is_cached: true,
      data_source: 'none',
      data_availability: 'no_data',
      synced_at: syncedAt,
    };

    try {
      const members = await databaseService.getTeamMembers().catch(() => []);
      if (!Array.isArray(members) || members.length === 0) return noProfile;
      const query = String(inputArgs?.engineer_id || '').trim().toLowerCase();
      const member = (await identityService.resolveMember(inputArgs?.engineer_id))
        || members.find((m) => m.id?.toLowerCase() === query || m.displayName?.toLowerCase() === query);
      if (!member) return noProfile;

      return {
        engineer_id: member.id,
        displayName: member.displayName,
        current_level: member.currentLevel || null,
        target_level: member.targetLevel || null,
        track: member.track || null,
        tenure_months: member.tenureMonths ?? null,
        weekly_workload_hours: null,
        weekly_meeting_hours: null,
        is_cached: true,
        data_source: 'postgres_team_members',
        data_availability: 'profile_only',
        synced_at: syncedAt,
      };
    } catch (_err) {
      return noProfile;
    }
  },
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data || {};
    const googleData = sourceResults.googleCalendar?.data || sourceResults.google?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';

    const requestedId = inputArgs.engineer_id ? String(inputArgs.engineer_id).trim() : '';
    const member = requestedId
      ? ((await identityService.resolveMember(requestedId)) || (await identityService.resolveMemberFromText(requestedId)))
      : null;
    let rawId = requestedId;
    if (!rawId || rawId.length > 30 || /\b(review|progression|readiness|career|growth|notes|developer|engineer|1-on-1|our)\b/i.test(rawId)) {
      rawId = member?.displayName || 'Unspecified engineer';
    }
    const resolvedName = member?.displayName || rawId;
    const engineerResolved = Boolean(member);

    // Calendar events only ever come from a live calendar source; never synthesize a meeting.
    const rawEvents = googleData.today_events || defaultData.today_events;
    const events = Array.isArray(rawEvents) ? rawEvents : [];
    const calendarConnected = Array.isArray(rawEvents) && googleData.data_availability !== 'not_connected';
    const calendarStatus = calendarConnected
      ? (events.length > 0 ? 'CONNECTED' : 'CONNECTED_NO_EVENTS')
      : 'NOT_CONNECTED';
    const calendarNotConnectedNote = googleData.source_status
      || 'Google Calendar is not connected — no live or cached calendar data available.';

    if (mode === 'LIST_RAW') {
      const eventRows = events.map((e) => {
        return `| **${e.summary || '(untitled event)'}** | \`${e.start_time || 'Time not provided'}\` | \`@${e.attendee || resolvedName}\` | ${e.status ? `\`${e.status}\`` : 'Status not provided'} |`;
      });

      let emptyRow = '| *No 1-on-1 meetings returned by Google Calendar* | - | - | - |';
      if (!calendarConnected) emptyRow = `| *${calendarNotConnectedNote}* | - | - | ⚪ No data |`;

      const listSummary = `### 📅 Scheduled 1-on-1 & Growth Check-ins (${events.length} Events)\n\n` +
        `| Meeting / Event | Time | Engineer / Attendee | Status |\n| :--- | :---: | :--- | :---: |\n` +
        (eventRows.length > 0 ? eventRows.join('\n') : emptyRow) +
        `\n\n> 💡 **1-on-1 Cadence**: Bi-weekly dedicated 1-on-1 coaching sessions are recommended to track career progression.`;

      return {
        mode: 'LIST_RAW',
        filter: inputArgs.filter || 'ALL',
        target: inputArgs.target || 'ALL',
        totalEvents: events.length,
        items: events,
        calendar_status: calendarStatus,
        engineer_resolved: engineerResolved,
        summary: listSummary,
      };
    }

    const currentLevel = inputArgs.current_level || member?.currentLevel || defaultData.current_level || 'L4_MID';
    const targetLevel = inputArgs.target_level || member?.targetLevel || defaultData.target_level || 'L5_SENIOR';
    const track = inputArgs.track || member?.track || defaultData.track || 'INDIVIDUAL_CONTRIBUTOR';
    const tenureMonths = inputArgs.tenure_months || member?.tenureMonths || defaultData.tenure_months || 18;
    const toHours = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const workloadHours = toHours(defaultData.weekly_workload_hours);
    const meetingHours = toHours(googleData.weekly_meeting_hours);

    // Burnout Index: only computed from measured hours. A known value over a threshold is enough
    // to flag HIGH/MEDIUM, but LOW requires both inputs to be measured; otherwise UNKNOWN.
    let burnoutRisk = 'UNKNOWN';
    if ((workloadHours !== null && workloadHours > 50.0) || (meetingHours !== null && meetingHours > 22.0)) {
      burnoutRisk = 'HIGH';
    } else if ((workloadHours !== null && workloadHours > 44.0) || (meetingHours !== null && meetingHours > 16.0)) {
      burnoutRisk = 'MEDIUM';
    } else if (workloadHours !== null && meetingHours !== null) {
      burnoutRisk = 'LOW';
    }
    const workloadLabel = workloadHours !== null ? `${workloadHours}h/wk` : 'Unknown (no workload source connected)';
    const meetingBasis = googleData.meeting_hours_basis || null;
    let meetingLabel = 'Unknown (Google Calendar not connected)';
    if (meetingHours !== null) {
      meetingLabel = `${meetingHours} hrs over next ${meetingBasis?.window_days || MEETING_HOURS_WINDOW_DAYS} days${meetingBasis?.truncated ? ' (lower bound — event limit reached)' : ''}`;
    } else if (calendarConnected) {
      meetingLabel = 'Unknown (calendar events have no measurable start/end times)';
    }

    // Competency ratings must come from a real source: explicit `skill_ratings` input or ratings
    // persisted on the team member record. Level benchmarks are targets, never a stand-in for
    // the engineer's actual ratings (Zero Misleading Fallbacks).
    const targetReqs = LEVEL_BENCHMARKS[targetLevel] || LEVEL_BENCHMARKS.L5_SENIOR;
    const realRatings = normalizeSkillRatings(inputArgs.skill_ratings || member?.skillRatings || defaultData.skill_ratings);
    const ratingsSource = inputArgs.skill_ratings ? 'input' : (member?.skillRatings || defaultData.skill_ratings ? 'team_member_record' : null);
    const ratedCount = Object.keys(realRatings).length;
    const scoringStatus = ratedCount === 0
      ? 'UNSCORED'
      : (ratedCount < COMPETENCY_DIMENSIONS.length ? 'PARTIAL' : 'SCORED');
    const isScored = scoringStatus !== 'UNSCORED';
    const ratingsCoverage = `${ratedCount} / ${COMPETENCY_DIMENSIONS.length}`;

    let totalGaps = 0;
    let totalTargetWeight = 0;
    const competencyRadar = [];
    const significantGaps = [];

    COMPETENCY_DIMENSIONS.forEach((dim) => {
      const targetRating = targetReqs[dim.key] || 4.0;
      const currentRating = realRatings[dim.key];

      if (currentRating === undefined) {
        competencyRadar.push({
          dimension: dim.name,
          code: dim.key,
          current: null,
          target: Number(targetRating.toFixed(1)),
          gap: null,
          status: 'UNRATED',
        });
        return;
      }

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

    // Readiness is computed only over dimensions that actually have ratings.
    const readinessScore = isScored
      ? Math.min(100, Math.max(0, Math.round((1 - (totalGaps / totalTargetWeight)) * 100)))
      : null;

    let readinessVerdict = 'UNSCORED';
    if (isScored) {
      readinessVerdict = 'ON_TRACK';
      if (readinessScore >= 90) {
        readinessVerdict = 'READY_FOR_PROMOTION';
      } else if (readinessScore < 75) {
        readinessVerdict = 'DEVELOPING';
      }
    }

    // Prerequisite Checklist: no data source tracks RFC authorship, mentorship cycles, production
    // regressions or on-call participation, so each prerequisite is UNKNOWN until verified.
    // (Competency scores are not evidence that a specific deliverable happened.)
    const prerequisites = [
      { name: 'Lead 1 High-Impact Architecture RFC to approval', status: 'UNKNOWN' },
      { name: 'Complete 1 Mentorship cycle with positive peer feedback', status: 'UNKNOWN' },
      { name: 'Zero critical production regressions in last 2 quarters', status: 'UNKNOWN' },
      { name: 'Active Incident Commander / on-call rotation participation', status: 'UNKNOWN' },
    ];
    const metPrereqsCount = prerequisites.filter((p) => p.status === 'MET').length;
    const unknownPrereqsCount = prerequisites.filter((p) => p.status === 'UNKNOWN').length;
    const prereqsLabel = unknownPrereqsCount === prerequisites.length
      ? `UNKNOWN (0 / ${prerequisites.length} verified)`
      : `${metPrereqsCount} / ${prerequisites.length}`;
    const readinessLabel = isScored ? `${readinessScore}%` : 'N/A';
    const verdictLabel = isScored
      ? `${readinessVerdict.replace(/_/g, ' ')}${scoringStatus === 'PARTIAL' ? `, partial: ${ratingsCoverage} dimensions rated` : ''}`
      : 'UNSCORED — competency ratings needed';
    const ratingsNeededNote = `No competency ratings on record for ${resolvedName}. Provide \`skill_ratings\` (1.0–5.0 for each of the 12 dimensions) from a calibrated review to compute promotion readiness against ${targetLevel}.`;

    // Roadmaps
    const roadmaps = {
      immediate_3_to_6m: {
        horizon: '3–6 Months',
        focus: !isScored
          ? `Collect calibrated competency ratings across all 12 dimensions to baseline against ${targetLevel}`
          : (significantGaps.length > 0
            ? `Close top competency gaps: ${significantGaps.slice(0, 2).join(', ')}`
            : `Sustain ${targetLevel} benchmarks across rated dimensions`),
        deliverables: !isScored
          ? [
            'Run a calibrated self + manager competency rating against the 12-dimension rubric',
            `Review the ${targetLevel} benchmark expectations together in the next 1-on-1`,
          ]
          : [
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
      ? `\n\n### 📓 Notion 1-on-1 Notes & Career Rubrics\n${notionDocs.map((d) => `- ${d.url ? `[${d.title}](${d.url})` : d.title} (Last edited: ${d.last_edited ? new Date(d.last_edited).toLocaleDateString() : 'unknown'})`).join('\n')}`
      : `\n\n### 📓 Notion 1-on-1 Notes & Career Rubrics\n- ${notionData.source_status || 'No Notion career notes found for this engineer.'}`;

    if (mode === 'DRILL_DOWN') {
      const drillSummary = `### 🎯 Skill Gap & Career Growth Breakdown: ${resolvedName} (${currentLevel} ➔ ${targetLevel})\n\n` +
        `- **Promotion Readiness Score**: **${readinessLabel}** (${verdictLabel})\n` +
        `- **Prerequisites Completed**: **${prereqsLabel}**\n` +
        `- **Top Growth Gaps**:\n` +
        (!isScored
          ? `  - ⚪ ${ratingsNeededNote}\n`
          : significantGaps.length > 0
            ? significantGaps.map((g) => `  - **${g}**: Benchmark gap against ${targetLevel} requirements.`).join('\n')
            : '  - 🟢 All rated competency benchmarks met for target level.\n') +
        `\n- **Immediate 3–6 Month Deliverable**: ${roadmaps.immediate_3_to_6m.focus}\n` +
        `  - ${roadmaps.immediate_3_to_6m.deliverables[0] || 'Lead architectural initiative'}\n\n` +
        (isScored
          ? `> 💡 **Next 1-on-1 Action**: Structure upcoming coaching sessions around closing the primary technical gap.`
          : `> 💡 **Next 1-on-1 Action**: Complete a calibrated competency rating before discussing promotion readiness.`);

      return {
        mode: 'DRILL_DOWN',
        engineer_id: member?.id || requestedId || null,
        engineer_resolved: engineerResolved,
        current_level: currentLevel,
        target_level: targetLevel,
        readiness_score: readinessScore,
        readiness_verdict: readinessVerdict,
        scoring_status: scoringStatus,
        ratings_coverage: ratingsCoverage,
        significant_gaps: significantGaps,
        prerequisites,
        summary: drillSummary,
      };
    }

    const summaryText = `### 🎯 Promotion Readiness Scorecard: ${resolvedName} (${currentLevel} ➔ ${targetLevel})

> **Track**: ${track === 'ENGINEERING_MANAGEMENT' ? 'Management (M1/M2)' : 'Individual Contributor (IC)'} | **Tenure**: ${tenureMonths} Months | **Promotion Readiness**: **${readinessLabel} (${verdictLabel})** | **Workload**: ${workloadLabel} (${burnoutRisk} Burnout Risk)

| Metric | Measured Value | Requirement | Status |
| :--- | :--- | :--- | :--- |
| **Promotion Readiness** | **${readinessLabel}** | $\\ge 90\%$ (Ready) | ${!isScored ? '⚪ Unscored — ratings needed' : readinessScore >= 90 ? '🟢 Ready for Promotion' : readinessScore >= 75 ? '🟡 On Track' : '🔴 Developing'} |
| **Prerequisites Met** | **${prereqsLabel}** | 100% Mandatory | ${unknownPrereqsCount > 0 ? '⚪ Unverified' : metPrereqsCount === prerequisites.length ? '🟢 Complete' : '🟡 In Progress'} |
| **Weekly Workload** | **${workloadHours !== null ? `${workloadHours} hrs/wk` : 'Unknown'}** | $\\le 44.0$ hrs/wk | ${burnoutRisk === 'LOW' ? '🟢 Sustainable' : burnoutRisk === 'MEDIUM' ? '🟡 Elevated' : burnoutRisk === 'HIGH' ? '🔴 High Burnout Risk' : '⚪ Unknown — hours not measured'} |
| **Significant Skill Gaps** | **${!isScored ? 'Unknown (no ratings)' : significantGaps.length > 0 ? significantGaps.join(', ') : 'None'}** | 0 Major Gaps | ${!isScored ? '⚪ Unscored' : significantGaps.length === 0 ? '🟢 None' : '⚠️ Action Required'} |

> 💡 **Executive Bottom Line**: ${!isScored ? `Promotion readiness is **UNSCORED**. ${ratingsNeededNote}` : `Overall readiness is **${verdictLabel} (${readinessScore}%)**. ${significantGaps.length > 0 ? `Primary growth area: **${significantGaps[0]}**.` : 'All rated dimension benchmarks satisfied.'}`}

<details>
<summary><b>📊 12-Dimension Competency Radar & Gap Analysis</b></summary>

| Competency Dimension | Current Rating | Target (${targetLevel}) | Status | Gap |
| :--- | :---: | :---: | :---: | :---: |
${competencyRadar.map((r) => `| **${r.dimension}** | ${r.current === null ? '— (unrated)' : `${r.current} / 5`} | ${r.target} / 5 | ${r.status === 'UNRATED' ? '⚪ Unrated' : r.status === 'MET' ? '✅ Met' : r.status === 'MINOR_GAP' ? '⚠️ Minor Gap' : '❌ Major Gap'} | ${r.gap === null ? '—' : r.gap > 0 ? `-${r.gap}` : '0.0'} |`).join('\n')}

- **Mandatory Prerequisites Checklist**:
${prerequisites.map((p) => `- [${p.status === 'MET' ? 'x' : ' '}] **${p.name}** (${p.status === 'UNKNOWN' ? 'UNKNOWN — not tracked by any connected source' : p.status})`).join('\n')}

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

- **Primary Stretch Project**: Not recorded — no stretch assignment source (Jira epics / Notion plans) is connected for this engineer.
- **Upcoming 1-on-1 Calendar Schedule**:
${events.length > 0
    ? events.slice(0, 10).map((ev) => `  * 📅 **${ev.start_time || 'Time not provided'}**: ${ev.summary || '(untitled event)'} (${ev.attendee || resolvedName})`).join('\n')
      + (events.length > 10 ? `\n  * …and ${events.length - 10} more` : '')
    : `  * ${calendarConnected ? 'No upcoming 1-on-1s returned by Google Calendar.' : calendarNotConnectedNote}`}
- **Weekly Meeting Load**: **${meetingLabel}** (Sustainability Status: **${burnoutRisk} Risk**).${notionSection}

</details>
`;

    return {
      mode: 'ANALYZE',
      engineer_id: member?.id || requestedId || null,
      engineer_resolved: engineerResolved,
      current_level: currentLevel,
      target_level: targetLevel,
      track,
      tenure_months: tenureMonths,
      metrics: {
        promotion_readiness_score: readinessScore,
        promotion_verdict: readinessVerdict,
        scoring_status: scoringStatus,
        ratings_coverage: ratingsCoverage,
        ratings_source: ratingsSource,
        burnout_risk_score: burnoutRisk,
        weekly_workload_hours: workloadHours,
        weekly_meeting_hours: meetingHours,
        meeting_hours_basis: meetingBasis,
        calendar_status: calendarStatus,
        prerequisites_met: prereqsLabel,
      },
      competency_radar: competencyRadar,
      skill_matrix_gaps: significantGaps,
      one_on_one_agenda: [
        !isScored
          ? `Complete a calibrated 12-dimension competency rating against ${targetLevel}`
          : `Review progress on ${significantGaps[0] || 'technical goals'}`,
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
  return createMicroAgent({
    name: options.name || 'people_agent',
    defaultTool: peopleGrowthTool,
    promptTemplate: peopleAgentPromptTemplate,
    customTools,
    options,
  });
}

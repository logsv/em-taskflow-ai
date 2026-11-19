import {
  peopleGrowthTool, createPeopleAgent, normalizeSkillRatings, normalizeCalendarEvent, computeMeetingHours,
  buildCalendarSourceResult, COMPETENCY_DIMENSIONS, LEVEL_BENCHMARKS,
} from '../../src/agent/peopleAgent.js';
import sinon from 'sinon';
import { SKILL_RATINGS_FIXTURES, PEOPLE_SOURCE_FIXTURES } from '../fixtures/seedTestData.js';

describe('peopleAgent & analyze_personnel_growth Tool Harness', () => {
  let sandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  const stubSources = ({ calendar, profile, notion } = {}) => {
    if (calendar !== undefined) sandbox.stub(peopleGrowthTool.mcpExecutors, 'googleCalendar').resolves(calendar);
    if (profile !== undefined) sandbox.stub(peopleGrowthTool.mcpExecutors, 'default').resolves(profile);
    if (notion !== undefined) sandbox.stub(peopleGrowthTool.mcpExecutors, 'notion').resolves(notion);
  };
  const calendarFrom = (events) => buildCalendarSourceResult(events, { source: 'mcp_google_calendar' });
  const ALEX_CALENDAR = () => calendarFrom(PEOPLE_SOURCE_FIXTURES.calendar_alex_events);
  const OVERLOADED_CALENDAR = () => calendarFrom(PEOPLE_SOURCE_FIXTURES.calendar_overloaded_events);

  it('should define 12 standardized competency dimensions', () => {
    expect(COMPETENCY_DIMENSIONS.length).toBe(12);
    const keys = COMPETENCY_DIMENSIONS.map((d) => d.key);
    expect(keys).toContain('ARCH');
    expect(keys).toContain('DB');
    expect(keys).toContain('CLOUD');
    expect(keys).toContain('SEC');
    expect(keys).toContain('CODE');
    expect(keys).toContain('DELIV');
    expect(keys).toContain('MENTOR');
    expect(keys).toContain('COLLAB');
    expect(keys).toContain('STRAT');
    expect(keys).toContain('INCID');
    expect(keys).toContain('ALIGN');
    expect(keys).toContain('CULT');
  });

  it('should evaluate engineer competencies across 12 dimensions against target level requirements', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenure_months: 18,
      skill_ratings: SKILL_RATINGS_FIXTURES.alex_l4_to_l5,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.name).toBe('analyze_personnel_growth');
    expect(res.data.mode).toBe('ANALYZE');
    expect(res.data.competency_radar.length).toBe(12);
    expect(res.data.metrics.scoring_status).toBe('SCORED');
    expect(res.data.metrics.ratings_coverage).toBe('12 / 12');
    expect(res.data.metrics.ratings_source).toBe('input');
    expect(res.data.metrics.promotion_readiness_score).toBe(86);
    expect(res.data.metrics.promotion_verdict).toBe('ON_TRACK');

    const arch = res.data.competency_radar.find((r) => r.code === 'ARCH');
    expect(arch.current).toBe(3.4);
    expect(arch.target).toBe(LEVEL_BENCHMARKS.L5_SENIOR.ARCH);
    expect(arch.gap).toBe(1.1);
    expect(arch.status).toBe('MAJOR_GAP');
    const code = res.data.competency_radar.find((r) => r.code === 'CODE');
    expect(code.status).toBe('MET');
    expect(res.data.skill_matrix_gaps).toContain('Architecture & System Design (-1.1)');

    expect(res.data.roadmaps.immediate_3_to_6m).toBeDefined();
    expect(res.data.roadmaps.immediate_3_to_6m.focus).toContain('Architecture & System Design');
    expect(res.data.roadmaps.medium_6_to_18m).toBeDefined();
    expect(res.data.roadmaps.long_term_1_to_3y).toBeDefined();
    expect(res.data.summary).toContain('Competency Radar & Gap Analysis');
    expect(res.data.summary).toContain('86%');
  });

  it('should return an explicit UNSCORED state when no real skill ratings exist', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenure_months: 18,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('ANALYZE');
    expect(res.data.metrics.promotion_readiness_score).toBeNull();
    expect(res.data.metrics.promotion_verdict).toBe('UNSCORED');
    expect(res.data.metrics.scoring_status).toBe('UNSCORED');
    expect(res.data.metrics.ratings_coverage).toBe('0 / 12');
    expect(res.data.metrics.ratings_source).toBeNull();

    // Radar lists target-level benchmarks with no invented current ratings.
    expect(res.data.competency_radar.length).toBe(12);
    res.data.competency_radar.forEach((r) => {
      expect(r.current).toBeNull();
      expect(r.gap).toBeNull();
      expect(r.status).toBe('UNRATED');
      expect(r.target).toBe(LEVEL_BENCHMARKS.L5_SENIOR[r.code]);
    });

    expect(res.data.skill_matrix_gaps).toEqual([]);
    expect(res.data.prerequisites.length).toBe(4);
    res.data.prerequisites.forEach((p) => expect(p.status).toBe('UNKNOWN'));
    expect(res.data.metrics.prerequisites_met).toContain('UNKNOWN');

    expect(res.data.roadmaps.immediate_3_to_6m.focus).toContain('Collect calibrated competency ratings');
    expect(res.data.summary).toContain('UNSCORED');
    expect(res.data.summary).toContain('skill_ratings');
    expect(res.data.summary).not.toMatch(/Promotion Readiness\*\*: \*\*\d+%/);
  });

  it('should score only rated dimensions and flag PARTIAL coverage', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
      skill_ratings: SKILL_RATINGS_FIXTURES.partial,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.metrics.scoring_status).toBe('PARTIAL');
    expect(res.data.metrics.ratings_coverage).toBe('3 / 12');
    expect(res.data.metrics.promotion_readiness_score).toBe(100);
    const rated = res.data.competency_radar.filter((r) => r.current !== null);
    const unrated = res.data.competency_radar.filter((r) => r.status === 'UNRATED');
    expect(rated.map((r) => r.code).sort()).toEqual(['ARCH', 'CODE', 'DELIV']);
    expect(unrated.length).toBe(9);
    unrated.forEach((r) => expect(r.current).toBeNull());
    expect(res.data.summary).toContain('partial: 3 / 12 dimensions rated');
  });

  it('should ignore out-of-range, unknown, and non-numeric ratings', () => {
    expect(normalizeSkillRatings(undefined)).toEqual({});
    expect(normalizeSkillRatings({ arch: 4, FOO: 3, DB: 9, SEC: 0, CODE: 'x', CLOUD: null })).toEqual({ ARCH: 4 });
  });

  it('should evaluate Management Track (M1/M2) with leadership and hiring prerequisites', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_sarah',
      current_level: 'L5_SENIOR',
      target_level: 'M1_EM',
      track: 'ENGINEERING_MANAGEMENT',
      tenure_months: 24,
      skill_ratings: SKILL_RATINGS_FIXTURES.sarah_l5_to_m1,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.track).toBe('ENGINEERING_MANAGEMENT');
    expect(res.data.metrics.promotion_readiness_score).toBe(96);
    expect(res.data.metrics.promotion_verdict).toBe('READY_FOR_PROMOTION');
    expect(res.data.roadmaps.long_term_1_to_3y.focus).toContain('Engineering Management');
  });

  it('should detect high burnout risk when workload or meeting hours exceed thresholds', async () => {
    stubSources({ calendar: OVERLOADED_CALENDAR(), profile: PEOPLE_SOURCE_FIXTURES.profile_overloaded });
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_overloaded',
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.metrics.burnout_risk_score).toBe('HIGH');
    expect(res.data.metrics.weekly_workload_hours).toBe(52);
    expect(res.data.metrics.weekly_meeting_hours).toBe(24);
    expect(res.data.summary).toContain('52 hrs/wk');
  });

  it('should rate burnout LOW only when both workload and meeting hours are measured and sustainable', async () => {
    stubSources({ calendar: ALEX_CALENDAR(), profile: PEOPLE_SOURCE_FIXTURES.profile_sustainable });
    const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex' });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.metrics.burnout_risk_score).toBe('LOW');
    expect(res.data.metrics.weekly_workload_hours).toBe(40);
    expect(res.data.metrics.weekly_meeting_hours).toBe(1.5);
    expect(res.data.metrics.meeting_hours_basis.method).toBe('sum_of_event_durations');
    expect(res.data.metrics.meeting_hours_basis.untimed_events_excluded).toBe(1);
    expect(res.data.metrics.calendar_status).toBe('CONNECTED');
    expect(res.data.summary).toContain('1.5 hrs over next 7 days');
  });

  it('should report UNKNOWN burnout risk and null hours when no hours source is connected', async () => {
    stubSources({ calendar: null });
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      sources: ['default', 'googleCalendar', 'notion'],
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.metrics.weekly_workload_hours).toBeNull();
    expect(res.data.metrics.weekly_meeting_hours).toBeNull();
    expect(res.data.metrics.burnout_risk_score).toBe('UNKNOWN');
    expect(res.data.metrics.calendar_status).toBe('NOT_CONNECTED');
    expect(res.data.today_schedule).toEqual([]);
    expect(res.data.summary).toContain('Workload**: Unknown');
    expect(res.data.summary).toContain('Google Calendar is not connected');
    expect(res.data.summary).not.toContain('41.5');
    expect(res.data.summary).not.toContain('14.5');
  });

  it('should not fabricate a stretch project, calendar events or Notion docs in the ANALYZE summary', async () => {
    stubSources({ calendar: null, notion: null });
    const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex' });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.summary).toContain('**Primary Stretch Project**: Not recorded');
    expect(res.data.summary).not.toContain('database-per-service vector architecture');
    expect(res.data.summary).not.toContain('Performance & Growth Review');
    expect(res.data.summary).not.toContain('notion.so/career-ladder');
    expect(res.data.summary).toContain('Notion is not connected');
  });

  it('should support LIST_RAW mode to return calendar 1-on-1 events', async () => {
    stubSources({ calendar: ALEX_CALENDAR() });
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'LIST_RAW',
      filter: 'ONE_ON_ONES',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('LIST_RAW');
    expect(Array.isArray(res.data.items)).toBe(true);
    expect(res.data.totalEvents).toBe(3);
    expect(res.data.calendar_status).toBe('CONNECTED');
    expect(res.data.items[0]).toEqual({
      summary: '1-on-1: Alex Williams / Manager',
      start_time: '2026-11-20T10:00:00Z',
      end_time: '2026-11-20T11:00:00Z',
      attendee: 'alex.williams@company.internal',
      status: 'confirmed',
    });
    expect(res.data.summary).toContain('Scheduled 1-on-1 & Growth Check-ins');
    expect(res.data.summary).toContain('1-on-1: Alex Williams / Manager');
    expect(res.data.summary).toContain('`tentative`');
    expect(res.data.summary).not.toContain('Confirmed');
  });

  it('should return no events and a not-connected note in LIST_RAW mode when the calendar is unavailable', async () => {
    stubSources({ calendar: null });
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'LIST_RAW',
      filter: 'ONE_ON_ONES',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.items).toEqual([]);
    expect(res.data.totalEvents).toBe(0);
    expect(res.data.calendar_status).toBe('NOT_CONNECTED');
    expect(res.data.summary).toContain('Google Calendar is not connected');
    expect(res.data.summary).not.toContain('Performance & Growth Review');
    expect(res.data.summary).not.toContain('🟢');
  });

  it('should support DRILL_DOWN mode for targeted skill gap analysis', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'DRILL_DOWN',
      target: 'SKILL_GAPS',
      skill_ratings: SKILL_RATINGS_FIXTURES.alex_l4_to_l5,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('DRILL_DOWN');
    expect(res.data.readiness_score).toBe(86);
    expect(res.data.scoring_status).toBe('SCORED');
    expect(res.data.significant_gaps.length).toBeGreaterThan(0);
    expect(res.data.summary).toContain('Skill Gap & Career Growth Breakdown');
  });

  it('should report UNSCORED in DRILL_DOWN mode when no ratings exist', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'DRILL_DOWN',
      target: 'SKILL_GAPS',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('DRILL_DOWN');
    expect(res.data.readiness_score).toBeNull();
    expect(res.data.readiness_verdict).toBe('UNSCORED');
    expect(res.data.scoring_status).toBe('UNSCORED');
    expect(res.data.significant_gaps).toEqual([]);
    res.data.prerequisites.forEach((p) => expect(p.status).toBe('UNKNOWN'));
    expect(res.data.summary).toContain('Skill Gap & Career Growth Breakdown');
    expect(res.data.summary).toContain('No competency ratings on record');
  });

  it('should execute multi-source executors including Notion notes and Google Calendar', async () => {
    stubSources({ calendar: ALEX_CALENDAR() });
    const res = await peopleGrowthTool.invoke({
      sources: ['default', 'googleCalendar', 'notion'],
      mode: 'ANALYZE',
      engineer_id: 'Alex Williams',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.summary).toBeDefined();
    expect(res.data.summary).toContain('Google Calendar 1-on-1 Sync');
    expect(res.data.summary).toContain('Career growth check-in');
    expect(res.data.metrics.weekly_meeting_hours).toBe(1.5);
  });

  it('should not default engineer_id to a placeholder engineer', async () => {
    stubSources({ calendar: null, notion: null });
    const res = await peopleGrowthTool.invoke({ mode: 'ANALYZE' });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.engineer_id).toBeNull();
    expect(res.data.engineer_resolved).toBe(false);
    expect(res.data.summary).toContain('Scorecard: Unspecified engineer');
    expect(res.data.summary).not.toContain('eng_alex');
    expect(res.data.summary).not.toContain('Alex Williams');
  });

  it('should label the scorecard with the resolved member and report their id', async () => {
    stubSources({ calendar: null, notion: null });
    const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex' });

    expect(res.data.engineer_id).toBe('mem_alex');
    expect(res.data.engineer_resolved).toBe(true);
    expect(res.data.summary).toContain('Scorecard: Alex Williams');
  });

  describe('calendar meeting-hours measurement', () => {
    it('should treat an unconfigured calendar as not connected rather than a measured zero', async () => {
      const saved = { a: process.env.GOOGLE_CALENDAR_API_KEY, b: process.env.GOOGLE_API_KEY };
      delete process.env.GOOGLE_CALENDAR_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      try {
        // The calendar client returns "[]" without credentials; that must not read as 0 meeting hours.
        expect(await peopleGrowthTool.mcpExecutors.googleCalendar({ engineer_id: 'eng_alex' })).toBeNull();
      } finally {
        if (saved.a !== undefined) process.env.GOOGLE_CALENDAR_API_KEY = saved.a;
        if (saved.b !== undefined) process.env.GOOGLE_API_KEY = saved.b;
      }
    });

    it('should normalize MCP and REST event shapes without inventing fields', () => {
      expect(normalizeCalendarEvent({ summary: 'Sync', start: '2026-11-20T10:00:00Z', end: '2026-11-20T10:45:00Z', attendees: ['a@x.io'] }))
        .toEqual({ summary: 'Sync', start_time: '2026-11-20T10:00:00Z', end_time: '2026-11-20T10:45:00Z', attendee: 'a@x.io', status: null });
      expect(normalizeCalendarEvent({ start: { dateTime: '2026-11-20T10:00:00Z' }, end: { dateTime: '2026-11-20T11:00:00Z' }, attendees: [{ email: 'b@x.io' }], status: 'confirmed' }))
        .toEqual({ summary: '(untitled event)', start_time: '2026-11-20T10:00:00Z', end_time: '2026-11-20T11:00:00Z', attendee: 'b@x.io', status: 'confirmed' });
      expect(normalizeCalendarEvent({})).toEqual({ summary: '(untitled event)', start_time: null, end_time: null, attendee: null, status: null });
    });

    it('should sum real durations and exclude all-day, cancelled and untimed events', () => {
      const events = [
        { start_time: '2026-11-20T10:00:00Z', end_time: '2026-11-20T11:30:00Z' },
        { start_time: '2026-11-20T13:00:00Z', end_time: '2026-11-20T13:15:00Z' },
        { start_time: '2026-11-21', end_time: '2026-11-22' },
        { start_time: '2026-11-21T09:00:00Z', end_time: null },
        { start_time: '2026-11-21T09:00:00Z', end_time: '2026-11-21T08:00:00Z' },
        { start_time: '2026-11-21T10:00:00Z', end_time: '2026-11-21T12:00:00Z', status: 'cancelled' },
      ];
      expect(computeMeetingHours(events)).toEqual({ hours: 1.8, timedCount: 2, untimedCount: 3 });
    });

    it('should report 0 hours for a connected calendar with no events and null when nothing is measurable', () => {
      expect(computeMeetingHours([]).hours).toBe(0);
      expect(computeMeetingHours([{ start_time: '2026-11-21', end_time: '2026-11-22' }]).hours).toBeNull();
    });

    it('should flag meeting hours as a lower bound when the event page limit is reached', () => {
      const events = PEOPLE_SOURCE_FIXTURES.calendar_overloaded_events;
      expect(buildCalendarSourceResult(events, { source: 't', maxResults: events.length }).meeting_hours_basis.truncated).toBe(true);
      const full = buildCalendarSourceResult(events, { source: 't' });
      expect(full.meeting_hours_basis.truncated).toBe(false);
      expect(full.weekly_meeting_hours).toBe(24);
    });
  });

  it('should fall back to PostgreSQL database profile when external MCP APIs time out', async () => {
    const fallback = await peopleGrowthTool.dbCacheFallback('default', { engineer_id: 'eng_alex' });
    expect(fallback.is_cached).toBe(true);
    expect(fallback.data_source).toBe('postgres_team_members');
    expect(fallback.engineer_id).toBe('mem_alex');
    expect(fallback.displayName).toBe('Alex Williams');
    expect(fallback.current_level).toBe('L4_MID');
    expect(fallback.weekly_workload_hours).toBeNull();
    expect(fallback.weekly_meeting_hours).toBeNull();
  });

  it('should return an explicit no-data profile instead of a placeholder member when none matches', async () => {
    const fallback = await peopleGrowthTool.dbCacheFallback('default', { engineer_id: 'eng_nobody_zz' });
    expect(fallback.data_availability).toBe('no_data');
    expect(fallback.displayName).toBeNull();
    expect(fallback.engineer_id).toBe('eng_nobody_zz');
    expect(fallback.weekly_workload_hours).toBeNull();
  });

  it('should return explicit not-connected empty states for Notion and Google Calendar fallbacks', async () => {
    const notion = await peopleGrowthTool.dbCacheFallback('notion', { engineer_id: 'eng_alex' });
    expect(notion.career_notes_count).toBe(0);
    expect(notion.career_docs).toEqual([]);
    expect(notion.is_cached).toBe(true);
    expect(notion.data_availability).toBe('not_connected');
    expect(JSON.stringify(notion)).not.toContain('notion.so');

    const calendar = await peopleGrowthTool.dbCacheFallback('googleCalendar', { engineer_id: 'eng_alex' });
    expect(calendar.today_events).toEqual([]);
    expect(calendar.weekly_meeting_hours).toBeNull();
    expect(calendar.data_availability).toBe('not_connected');
  });

  it('should instantiate createPeopleAgent graph', () => {
    const agent = createPeopleAgent();
    expect(agent).toBeDefined();
  });
});

import { peopleGrowthTool, createPeopleAgent, normalizeSkillRatings, COMPETENCY_DIMENSIONS, LEVEL_BENCHMARKS } from '../../src/agent/peopleAgent.js';
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
    stubSources({ calendar: PEOPLE_SOURCE_FIXTURES.calendar_overloaded, profile: PEOPLE_SOURCE_FIXTURES.profile_overloaded });
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
    stubSources({ calendar: PEOPLE_SOURCE_FIXTURES.calendar_alex, profile: PEOPLE_SOURCE_FIXTURES.profile_sustainable });
    const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex' });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.metrics.burnout_risk_score).toBe('LOW');
    expect(res.data.metrics.weekly_workload_hours).toBe(40);
    expect(res.data.metrics.weekly_meeting_hours).toBe(12);
    expect(res.data.metrics.calendar_status).toBe('CONNECTED');
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
    stubSources({ calendar: PEOPLE_SOURCE_FIXTURES.calendar_alex });
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'LIST_RAW',
      filter: 'ONE_ON_ONES',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('LIST_RAW');
    expect(Array.isArray(res.data.items)).toBe(true);
    expect(res.data.totalEvents).toBe(2);
    expect(res.data.calendar_status).toBe('CONNECTED');
    expect(res.data.items).toEqual(PEOPLE_SOURCE_FIXTURES.calendar_alex.today_events);
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
    stubSources({ calendar: PEOPLE_SOURCE_FIXTURES.calendar_alex });
    const res = await peopleGrowthTool.invoke({
      sources: ['default', 'googleCalendar', 'notion'],
      mode: 'ANALYZE',
      engineer_id: 'Alex Williams',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.summary).toBeDefined();
    expect(res.data.summary).toContain('Google Calendar 1-on-1 Sync');
    expect(res.data.summary).toContain('Career growth check-in');
    expect(res.data.metrics.weekly_meeting_hours).toBe(12);
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

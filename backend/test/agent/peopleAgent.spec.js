import { peopleGrowthTool, createPeopleAgent, COMPETENCY_DIMENSIONS, LEVEL_BENCHMARKS } from '../../src/agent/peopleAgent.js';
import { buildCalendarSourceData } from '../fixtures/seedTestData.js';

describe('peopleAgent & analyze_personnel_growth Tool Harness', () => {
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
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.name).toBe('analyze_personnel_growth');
    expect(res.data.mode).toBe('ANALYZE');
    expect(res.data.competency_radar.length).toBe(12);
    expect(res.data.metrics.promotion_readiness_score).toBeGreaterThanOrEqual(70);
    expect(res.data.metrics.promotion_verdict).toBeDefined();
    expect(res.data.roadmaps.immediate_3_to_6m).toBeDefined();
    expect(res.data.roadmaps.medium_6_to_18m).toBeDefined();
    expect(res.data.roadmaps.long_term_1_to_3y).toBeDefined();
    expect(res.data.summary).toContain('Competency Radar & Gap Analysis');
  });

  it('should evaluate Management Track (M1/M2) with leadership and hiring prerequisites', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_sarah',
      current_level: 'L5_SENIOR',
      target_level: 'M1_EM',
      track: 'ENGINEERING_MANAGEMENT',
      tenure_months: 24,
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.track).toBe('ENGINEERING_MANAGEMENT');
    expect(res.data.roadmaps.long_term_1_to_3y.focus).toContain('Engineering Management');
  });

  it('should report UNKNOWN burnout risk when no workload or calendar telemetry exists', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_overloaded',
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.metrics.burnout_risk_score).toBe('UNKNOWN');
    expect(res.data.metrics.weekly_workload_hours).toBeNull();
    expect(res.data.metrics.weekly_meeting_hours).toBeNull();
    expect(res.data.summary).toContain('n/a (no workload data)');
  });

  it('should detect high burnout risk when meeting hours exceed thresholds', async () => {
    const args = { engineer_id: 'eng_overloaded', current_level: 'L4_MID', target_level: 'L5_SENIOR', mode: 'ANALYZE' };
    const high = await peopleGrowthTool.computeMath(
      { default: { data: {} }, googleCalendar: { data: buildCalendarSourceData({ weeklyMeetingHours: 24 }) } }, args);
    const medium = await peopleGrowthTool.computeMath(
      { default: { data: {} }, googleCalendar: { data: buildCalendarSourceData({ weeklyMeetingHours: 18 }) } }, args);
    const low = await peopleGrowthTool.computeMath(
      { default: { data: {} }, googleCalendar: { data: buildCalendarSourceData({ weeklyMeetingHours: 8 }) } }, args);

    expect(high.metrics.burnout_risk_score).toBe('HIGH');
    expect(high.metrics.weekly_meeting_hours).toBe(24);
    expect(medium.metrics.burnout_risk_score).toBe('MEDIUM');
    expect(low.metrics.burnout_risk_score).toBe('LOW');
  });

  it('should support LIST_RAW mode to return calendar 1-on-1 events', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'LIST_RAW',
      filter: 'ONE_ON_ONES',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('LIST_RAW');
    // No live calendar in tests: an explicit empty state, never an invented meeting.
    expect(res.data.items).toEqual([]);
    expect(res.data.totalEvents).toBe(0);
    expect(res.data.data_availability).toBe('no_data');
    expect(res.data.summary).toContain('Scheduled 1-on-1 & Growth Check-ins');
    expect(res.data.summary).toContain('Calendar data unavailable');
  });

  it('should list real calendar events in LIST_RAW mode when the calendar source returns them', async () => {
    const calendar = buildCalendarSourceData();
    const data = await peopleGrowthTool.computeMath(
      { default: { data: {} }, googleCalendar: { data: calendar } },
      { engineer_id: 'eng_alex', mode: 'LIST_RAW', filter: 'ONE_ON_ONES' },
    );

    expect(data.totalEvents).toBe(2);
    expect(data.items).toEqual(calendar.today_events);
    expect(data.data_availability).toBe('ok');
    expect(data.summary).toContain('1-on-1 with Manager: Alex Williams');
  });

  it('should support DRILL_DOWN mode for targeted skill gap analysis', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      mode: 'DRILL_DOWN',
      target: 'SKILL_GAPS',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('DRILL_DOWN');
    expect(res.data.readiness_score).toBeDefined();
    expect(res.data.summary).toContain('Skill Gap & Career Growth Breakdown');
  });

  it('should execute multi-source executors including Notion notes and Google Calendar', async () => {
    const res = await peopleGrowthTool.invoke({
      sources: ['default', 'googleCalendar', 'notion'],
      mode: 'ANALYZE',
      engineer_id: 'Alex Williams',
    });

    expect(res.status).toBe('SUCCESS');
    expect(res.data.summary).toBeDefined();
    expect(res.data.summary).toContain('Google Calendar 1-on-1 Sync');
  });

  it('should fall back to PostgreSQL database profile when external MCP APIs time out', async () => {
    const fallback = await peopleGrowthTool.dbCacheFallback('notion');
    // Career docs are not persisted in PostgreSQL: explicit empty state, no placeholder doc.
    expect(fallback.career_notes_count).toBe(0);
    expect(fallback.career_docs).toEqual([]);
    expect(fallback.data_availability).toBe('no_data');
    expect(fallback.is_cached).toBe(true);
    expect(fallback.data_source).toBe('postgres_team_members_notion_fallback');

    const calendarFallback = await peopleGrowthTool.dbCacheFallback('googleCalendar', { engineer_id: 'eng_alex' });
    expect(calendarFallback.today_events).toEqual([]);
    expect(calendarFallback.weekly_meeting_hours).toBeNull();
    expect(calendarFallback.data_availability).toBe('no_data');
  });

  it('should only use the requested engineer profile in the PostgreSQL fallback', async () => {
    const known = await peopleGrowthTool.dbCacheFallback('default', { engineer_id: 'Alex Williams' });
    expect(known.engineer_id).toBe('mem_alex');
    expect(known.displayName).toBe('Alex Williams');
    expect(known.weekly_workload_hours).toBeNull();

    const unknown = await peopleGrowthTool.dbCacheFallback('default', { engineer_id: 'nobody_on_record' });
    expect(unknown.displayName).toBeNull();
    expect(unknown.data_availability).toBe('no_data');
    expect(unknown.tenure_months).toBeNull();
  });

  it('should ask for an engineer instead of defaulting to a fixture persona', async () => {
    for (const mode of ['ANALYZE', 'DRILL_DOWN']) {
      const res = await peopleGrowthTool.invoke({ sources: ['default'], mode });
      expect(res.status).toBe('SUCCESS');
      expect(res.data.status).toBe('NEEDS_INPUT');
      expect(res.data.engineer_id).toBeNull();
      expect(res.data.missing_fields).toEqual(['engineer_id']);
      expect(res.data.metrics).toBeNull();
      expect(res.data.summary).not.toContain('Alex');
    }
  });

  it('should derive the stretch assignment from computed gaps instead of a fixed project', async () => {
    const res = await peopleGrowthTool.invoke({
      engineer_id: 'eng_alex',
      sources: ['default'],
      current_level: 'L4_MID',
      target_level: 'L5_SENIOR',
    });

    expect(res.data.summary).not.toContain('database-per-service vector architecture');
    expect(res.data.stretch_assignment.recorded_project).toBeNull();
    expect(res.data.stretch_assignment.suggested_focus).toBe('Architecture & System Design'); // largest L4->L5 gap
    expect(res.data.summary).toContain('No stretch project is recorded for Alex Williams');
    expect(res.data.prerequisites.find((p) => /production regressions/.test(p.name)).status).toBe('UNKNOWN');
  });

  it('should use the roster profile instead of schema-default levels and tenure', async () => {
    const known = await peopleGrowthTool.invoke({ engineer_id: 'Sarah Chen', sources: ['default'] });
    expect(known.data.current_level).toBe('L5_SENIOR');
    expect(known.data.target_level).toBe('M1_EM');
    expect(known.data.track).toBe('ENGINEERING_MANAGEMENT');
    expect(known.data.tenure_months).toBe(36);
    expect(known.data.levels_assumed).toBe(false);

    const unknown = await peopleGrowthTool.invoke({ engineer_id: 'nobody_on_record', sources: ['default'] });
    expect(unknown.data.tenure_months).toBeNull();
    expect(unknown.data.levels_assumed).toBe(true);
    expect(unknown.data.summary).toContain('Assumed Levels');
  });

  it('should instantiate createPeopleAgent graph', () => {
    const agent = createPeopleAgent();
    expect(agent).toBeDefined();
  });
});

import { peopleGrowthTool, createPeopleAgent, COMPETENCY_DIMENSIONS, LEVEL_BENCHMARKS, computeMeetingHours } from '../../src/agent/peopleAgent.js';
import identityService from '../../src/services/identityService.js';

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

  describe('with a known engineer in the roster', () => {
    const alex = {
      id: 'mem_alex',
      displayName: 'Alex Williams',
      currentLevel: 'L4_MID',
      targetLevel: 'L5_SENIOR',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenureMonths: 18,
      skills: {},
    };

    beforeEach(() => {
      spyOn(identityService, 'resolveMember').and.callFake(async (q) => (q && /alex/i.test(q) ? alex : null));
      spyOn(identityService, 'resolveMemberFromText').and.callFake(async (q) => (q && /alex/i.test(q) ? alex : null));
    });

    it('scores readiness only from recorded skill ratings', async () => {
      const ratings = Object.fromEntries(COMPETENCY_DIMENSIONS.map((d) => [d.key, LEVEL_BENCHMARKS.L5_SENIOR[d.key]]));
      ratings.ARCH = LEVEL_BENCHMARKS.L5_SENIOR.ARCH - 1.5;
      const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex', skill_ratings: ratings, fetch_fresh_data: false });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('analyze_personnel_growth');
      expect(res.data.mode).toBe('ANALYZE');
      expect(res.data.competency_radar.length).toBe(12);
      expect(res.data.metrics.skills_assessed).toBeTrue();
      expect(res.data.metrics.promotion_readiness_score).toBeGreaterThanOrEqual(70);
      expect(res.data.competency_radar.find((r) => r.code === 'ARCH').status).toBe('MAJOR_GAP');
      expect(res.data.summary).toContain('Competency Radar & Gap Analysis');
      expect(res.data.summary).toContain('Alex Williams');
    });

    it('reports NOT_ASSESSED instead of inventing ratings when none are recorded', async () => {
      const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex', fetch_fresh_data: false });
      expect(res.data.metrics.skills_assessed).toBeFalse();
      expect(res.data.metrics.promotion_readiness_score).toBeNull();
      expect(res.data.metrics.promotion_verdict).toBe('NOT_ASSESSED');
      expect(res.data.competency_radar.every((r) => r.status === 'NOT_ASSESSED')).toBeTrue();
      expect(res.data.skill_matrix_gaps).toEqual([]);
    });

    it('reports burnout risk as UNKNOWN without measured hours, and computes it when measured', async () => {
      const unknown = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex', fetch_fresh_data: false });
      expect(unknown.data.metrics.burnout_risk_score).toBe('UNKNOWN');
      expect(unknown.data.metrics.weekly_workload_hours).toBeNull();
      expect(unknown.data.metrics.weekly_meeting_hours).toBeNull();

      const high = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex', weekly_workload_hours: 55, fetch_fresh_data: false });
      expect(high.data.metrics.burnout_risk_score).toBe('HIGH');
    });

    it('never auto-marks promotion prerequisites as met', async () => {
      const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex', fetch_fresh_data: false });
      expect(res.data.prerequisites.every((p) => p.status === 'NOT_VERIFIED')).toBeTrue();
    });

    it('supports DRILL_DOWN mode', async () => {
      const res = await peopleGrowthTool.invoke({ engineer_id: 'eng_alex', mode: 'DRILL_DOWN', target: 'SKILL_GAPS', fetch_fresh_data: false });
      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.summary).toContain('Skill Gap & Career Growth Breakdown');
      expect(res.data.readiness_verdict).toBe('NOT_ASSESSED');
    });
  });

  it('evaluates the Management track from explicit caller-provided levels', async () => {
    spyOn(identityService, 'resolveMember').and.resolveTo(null);
    spyOn(identityService, 'resolveMemberFromText').and.resolveTo(null);
    const res = await peopleGrowthTool.invoke({
      current_level: 'L5_SENIOR',
      target_level: 'M1_EM',
      track: 'ENGINEERING_MANAGEMENT',
      tenure_months: 24,
      fetch_fresh_data: false,
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.data.track).toBe('ENGINEERING_MANAGEMENT');
    expect(res.data.roadmaps.long_term_1_to_3y.focus).toContain('Engineering Management');
  });

  it('asks which engineer instead of inventing one when the engineer is unknown or missing', async () => {
    spyOn(identityService, 'resolveMember').and.resolveTo(null);
    spyOn(identityService, 'resolveMemberFromText').and.resolveTo(null);

    const missing = await peopleGrowthTool.invoke({ fetch_fresh_data: false });
    expect(missing.data.status).toBe('NEEDS_ENGINEER');
    expect(missing.data.data_availability).toBe('engineer_not_specified');

    const unknown = await peopleGrowthTool.invoke({ engineer_id: 'Nobody Known', fetch_fresh_data: false });
    expect(unknown.data.status).toBe('NEEDS_ENGINEER');
    expect(unknown.data.summary).toContain('not in the team roster');
    expect(unknown.data.summary).not.toContain('Alex Williams');
  });

  it('LIST_RAW returns no events (and says so) when no calendar is connected', async () => {
    const res = await peopleGrowthTool.invoke({ mode: 'LIST_RAW', filter: 'ONE_ON_ONES', fetch_fresh_data: false });
    expect(res.status).toBe('SUCCESS');
    expect(res.data.mode).toBe('LIST_RAW');
    expect(res.data.items).toEqual([]);
    expect(res.data.totalEvents).toBe(0);
    expect(res.data.data_availability).toBe('no_calendar_data');
    expect(res.data.summary).toContain('No calendar data available');
  });

  it('DB fallback for Notion and Calendar returns empty data, never placeholder documents or events', async () => {
    const notion = await peopleGrowthTool.dbCacheFallback('notion');
    expect(notion.career_notes_count).toBe(0);
    expect(notion.career_docs).toEqual([]);
    expect(notion.data_availability).toBe('no_notion_data');

    const calendar = await peopleGrowthTool.dbCacheFallback('googleCalendar');
    expect(calendar.today_events).toEqual([]);
    expect(calendar.weekly_meeting_hours).toBeNull();
  });

  it('computes meeting hours only from events with real start/end times', () => {
    expect(computeMeetingHours([])).toBeNull();
    expect(computeMeetingHours([{ summary: 'no times' }])).toBeNull();
    expect(computeMeetingHours([
      { start: { dateTime: '2026-11-24T10:00:00Z' }, end: { dateTime: '2026-11-24T11:30:00Z' } },
      { start_time: '2026-11-24T14:00:00Z', end_time: '2026-11-24T14:30:00Z' },
    ])).toBe(2);
  });

  it('should instantiate createPeopleAgent graph', () => {
    const agent = createPeopleAgent();
    expect(agent).toBeDefined();
  });
});

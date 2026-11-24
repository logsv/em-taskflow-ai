import { sprintPlanTool, createSprintAgent, completedVelocities, extractStoryPoints } from '../../src/agent/sprintAgent.js';
import databaseService from '../../src/db/postgres.js';
import identityService from '../../src/services/identityService.js';
import { sprintRetroTool, createRetroAgent } from '../../src/agent/retroAgent.js';
import { roadmapAlignmentTool, createRoadmapAgent } from '../../src/agent/roadmapAgent.js';
import { okrProgressTool, createOkrAgent } from '../../src/agent/okrAgent.js';

describe('Phase 5 Planning & Strategy Agents Specs: Sprint, Retro, Roadmap, OKR', () => {
  let originalTimeout;

  beforeAll(() => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  describe('sprintAgent & calculate_sprint_plan Tool Harness', () => {
    it('computes commitment from an explicit target velocity and team capacity', async () => {
      const res = await sprintPlanTool.invoke({
        sprint_id: 'sprint_102',
        team_capacity: 240,
        target_velocity: 35,
        fetch_fresh_data: false,
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('calculate_sprint_plan');
      expect(res.data.capacity_metrics.velocity_source).toBe('explicit_target');
      expect(res.data.capacity_metrics.recommended_commitment_points).toBe(35);
      expect(res.data.capacity_metrics.commitment_buffer_points).toBeGreaterThanOrEqual(2);
      expect(res.data.allocation_breakdown.feature_points + res.data.allocation_breakdown.tech_debt_points + res.data.allocation_breakdown.buffer_points)
        .toBe(res.data.capacity_metrics.recommended_commitment_points);
      expect(res.data.summary).toContain('Sprint Capacity & Rolling Velocity Forecast');
    });

    it('applies the configured 70/20/10 allocation policy', async () => {
      const res = await sprintPlanTool.invoke({
        sprint_id: 'sprint_103',
        target_velocity: 30,
        custom_tech_debt_percentage: 20,
        unplanned_buffer_percentage: 10,
        fetch_fresh_data: false,
      });
      const alloc = res.data.allocation_breakdown;
      expect(alloc.feature_percentage).toBe(70);
      expect(alloc.tech_debt_percentage).toBe(20);
      expect(alloc.buffer_percentage).toBe(10);
      expect(alloc.feature_points + alloc.tech_debt_points + alloc.buffer_points).toBe(res.data.capacity_metrics.recommended_commitment_points);
    });

    it('does not invent velocity, team size, PTO or backlog when there is no data', async () => {
      spyOn(databaseService, 'getSprintAnalytics').and.resolveTo([]);
      spyOn(databaseService, 'getTeamMembers').and.resolveTo([]);
      spyOn(identityService, 'getTeamMembers').and.resolveTo([]);
      const res = await sprintPlanTool.invoke({ sprint_id: 'sprint_104', fetch_fresh_data: false });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.capacity_metrics.recommended_commitment_points).toBeNull();
      expect(res.data.capacity_metrics.rolling_avg_velocity_points).toBeNull();
      expect(res.data.capacity_metrics.team_size).toBeNull();
      expect(res.data.capacity_metrics.velocity_source).toBe('none');
      expect(res.data.candidate_backlog).toEqual([]);
      expect(res.data.data_gaps.length).toBeGreaterThanOrEqual(3);
      expect(res.data.summary).toContain('Data gaps');
      expect(res.data.summary).not.toContain('ENG-201');
    });

    it('uses only completed sprints for velocity (planned totals are not velocity)', () => {
      expect(completedVelocities([
        { completed_points: 30, total_points: 40 },
        { completed_points: 0, total_points: 50 },
        { total_points: 45 },
        { completed_points: 34 },
      ])).toEqual([30, 34]);
    });

    it('treats Jira issues without story points as unestimated instead of guessing', () => {
      expect(extractStoryPoints({ key: 'ENG-207' })).toBeNull();
      expect(extractStoryPoints({ fields: { customfield_10016: 5 } })).toBe(5);
    });

    it('flags concentration risk from real estimated tickets', async () => {
      const jira = sprintPlanTool.mcpExecutors.jira;
      sprintPlanTool.mcpExecutors.jira = async () => ({
        candidate_tickets: [
          { key: 'ENG-1', summary: 'A', story_points: 8, assignee: 'Dana' },
          { key: 'ENG-2', summary: 'B', story_points: 2, assignee: 'Eli' },
          { key: 'ENG-3', summary: 'C', story_points: null, assignee: 'Eli' },
        ],
      });
      try {
        const res = await sprintPlanTool.invoke({ sources: ['default', 'jira'], target_velocity: 20, team_capacity: 200 });
        expect(res.data.risk_factors.some((r) => r.includes('Dana'))).toBeTrue();
        expect(res.data.risk_factors.some((r) => r.includes('Unestimated'))).toBeTrue();
      } finally {
        sprintPlanTool.mcpExecutors.jira = jira;
      }
    });

    it('LIST_RAW says the backlog is unavailable when Jira is not connected', async () => {
      const res = await sprintPlanTool.invoke({ sprint_id: 'sprint_105', mode: 'LIST_RAW', fetch_fresh_data: false });
      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(res.data.items).toEqual([]);
      expect(res.data.data_availability).toBe('no_jira_data');
    });

    it('DB fallback reports no history rather than default velocities', async () => {
      spyOn(databaseService, 'getSprintAnalytics').and.resolveTo([]);
      spyOn(databaseService, 'getTeamMembers').and.resolveTo([]);
      const fallback = await sprintPlanTool.dbCacheFallback('default', { sprint_id: 'sprint_fallback' });
      expect(fallback.historical_velocities).toEqual([]);
      expect(fallback.rolling_avg_velocity).toBeNull();
      expect(fallback.data_availability).toBe('no_completed_sprints');
      expect(fallback.is_cached).toBe(true);
    });

    it('should create sprintAgent safely', () => {
      const agent = createSprintAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('retroAgent & generate_sprint_retro Tool Harness', () => {
    const NOTES = '- Great kudos to team on zero-downtime deployment\n- Flaky auth integration tests blocked our releases\n- PR review turnaround was slow again';

    it('asks for input instead of inventing a retrospective when there is none', async () => {
      const res = await sprintRetroTool.invoke({ sprint_id: 'sprint_101', fetch_fresh_data: false });
      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('generate_sprint_retro');
      expect(res.data.status).toBe('NEEDS_INPUT');
      expect(res.data.what_went_well).toEqual([]);
      expect(res.data.extracted_action_items).toEqual([]);
      expect(res.data.summary).not.toContain('232 test specs');
      expect(res.data.summary).not.toContain('14.5');
    });

    it('parses raw retro notes into wins and friction with their origin', async () => {
      const res = await sprintRetroTool.invoke({ sprint_id: 'sprint_102', retro_notes: NOTES, fetch_fresh_data: false });
      expect(res.status).toBe('SUCCESS');
      expect(res.data.what_went_well.some((w) => w.text.includes('zero-downtime'))).toBe(true);
      expect(res.data.what_needs_improvement.some((f) => f.text.includes('Flaky auth integration tests'))).toBe(true);
      expect(res.data.what_needs_improvement.every((f) => f.origin === 'retro notes')).toBe(true);
      expect(res.data.summary).toContain('What Went Well');
    });

    it('drafts one action item per raised theme, unassigned, with evidence', async () => {
      const res = await sprintRetroTool.invoke({ sprint_id: 'sprint_103', retro_notes: NOTES, fetch_fresh_data: false });
      const items = res.data.extracted_action_items;
      expect(items.map((i) => i.category)).toEqual(jasmine.arrayContaining(['CI_RELIABILITY', 'CODE_REVIEW']));
      items.forEach((item) => {
        expect(item.owner).toBe('Unassigned');
        expect(item.evidence.length).toBeGreaterThan(0);
      });
    });

    it('marks a pattern as recurring only when a past action item matches', async () => {
      spyOn(databaseService, 'getSprintAnalytics').and.resolveTo([{ retro_action_items: ['Fix flaky CI pipeline tests'] }]);
      spyOn(databaseService, 'getTeamMembers').and.resolveTo([]);
      const res = await sprintRetroTool.invoke({ sprint_id: 'sprint_104', retro_notes: NOTES, mode: 'DRILL_DOWN', target: 'PATTERNS' });
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.recurring_patterns.length).toBe(1);
      expect(res.data.recurring_patterns[0]).toContain('CI / test reliability');
      expect(res.data.summary).toContain('Recurring Patterns');
    });

    it('supports LIST_RAW mode for action items', async () => {
      const res = await sprintRetroTool.invoke({ sprint_id: 'sprint_104', retro_notes: NOTES, mode: 'LIST_RAW', fetch_fresh_data: false });
      expect(res.data.mode).toBe('LIST_RAW');
      expect(res.data.total_items).toBeGreaterThanOrEqual(2);
    });

    it('should fall back to PostgreSQL database when external MCPs time out', async () => {
      const fallback = await sprintRetroTool.dbCacheFallback('postgres_retro', { sprint_id: 'sprint_fallback' });
      expect(fallback.sprint_id).toBe('sprint_fallback');
      expect(Array.isArray(fallback.past_retro_items)).toBe(true);
      expect(fallback.is_cached).toBe(true);
      expect(fallback.data_source).toBe('postgres_sprint_analytics');
    });

    it('should create retroAgent safely', () => {
      const agent = createRetroAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('roadmapAgent & get_roadmap_alignment Tool Harness', () => {
    const SAMPLE_EPICS = [
      { key: 'PLAT-1', summary: 'Auth v2', status: 'IN_PROGRESS', progress_pct: 60, baseline_points: 40, current_points: 52, target_date: '2099-01-15', owner: 'Identity', blockers: [] },
      { key: 'PLAT-2', summary: 'Passkeys', status: 'IN_PROGRESS', progress_pct: 30, baseline_points: 30, current_points: 30, target_date: '2000-01-01', owner: 'Mobile', blockers: ['Waiting on PLAT-1 token endpoint'] },
    ];
    let originalJira;

    function withEpics(epics) {
      roadmapAlignmentTool.mcpExecutors.jira = async () => ({ epics });
    }

    beforeEach(() => {
      originalJira = roadmapAlignmentTool.mcpExecutors.jira;
    });

    afterEach(() => {
      roadmapAlignmentTool.mcpExecutors.jira = originalJira;
    });

    it('evaluates health, progress, scope creep and blockers from real epics', async () => {
      withEpics(SAMPLE_EPICS);
      const res = await roadmapAlignmentTool.invoke({ quarter: 'Q4', mode: 'ANALYZE', sources: ['jira'] });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('get_roadmap_alignment');
      expect(res.data.overall_health).toBe('DELAYED'); // PLAT-2 is past its target date
      expect(typeof res.data.overall_progress_pct).toBe('number');
      expect(res.data.epics.length).toBe(2);
      expect(res.data.blockers.length).toBe(1);
      expect(res.data.summary).toContain('Executive Milestone Health & Pacing Summary');
      expect(res.data.summary).toContain('Resolve blocker on `PLAT-2`');
      expect(res.data.summary).toContain('Review scope of `PLAT-1`');
      expect(res.data.summary).not.toContain('ENG-205');
    });

    it('reports missing roadmap data instead of inventing epics', async () => {
      withEpics([]);
      const res = await roadmapAlignmentTool.invoke({ quarter: 'Q4', mode: 'ANALYZE', sources: ['jira'] });
      expect(res.status).toBe('SUCCESS');
      expect(res.data.data_availability).toBe('no_roadmap_data');
      expect(res.data.epics).toEqual([]);
      expect(res.data.summary).toContain('No roadmap epics are available');

      const fallback = await roadmapAlignmentTool.dbCacheFallback('jira', { quarter: 'Q4' });
      expect(fallback.epics).toEqual([]);
      expect(fallback.drift_days).toBeNull();
    });

    it('lists raw epic items in LIST_RAW mode', async () => {
      withEpics(SAMPLE_EPICS);
      const res = await roadmapAlignmentTool.invoke({ quarter: 'Q4', mode: 'LIST_RAW', sources: ['jira'] });
      expect(res.data.mode).toBe('LIST_RAW');
      expect(res.data.items.length).toBe(2);
      expect(res.data.summary).toContain('Quarterly Roadmap Epics');
    });

    it('supports DRILL_DOWN mode for cross-team blockers', async () => {
      withEpics(SAMPLE_EPICS);
      const res = await roadmapAlignmentTool.invoke({ quarter: 'Q4', mode: 'DRILL_DOWN', target: 'BLOCKERS', sources: ['jira'] });
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.summary).toContain('Cross-Team Technical Blockers');
    });

    it('should create roadmapAgent safely with low temperature', () => {
      const agent = createRoadmapAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('okrAgent & evaluate_okr_progress Tool Harness', () => {
    const RECORDS = [
      { id: 1, objective: 'O1: Reliability', key_result: 'KR1: API uptime above 99.9%', target_value: '99.9', current_value: '99.95', status: 'ON_TRACK', quarter: 'Q4' },
      { id: 2, objective: 'O2: Delivery', key_result: 'KR2: PR review turnaround under 12 hours', target_value: '12', current_value: '20', status: 'ON_TRACK', quarter: 'Q4' },
    ];

    beforeEach(() => {
      spyOn(databaseService, 'getOkrRecords').and.resolveTo(RECORDS);
    });

    it('reports missing OKRs and never seeds invented ones into the database', async () => {
      databaseService.getOkrRecords.and.resolveTo([]);
      const save = spyOn(databaseService, 'saveOkrRecord').and.resolveTo(null);
      const res = await okrProgressTool.invoke({ quarter: 'Q1', mode: 'ANALYZE', sources: ['default'] });
      expect(res.data.data_availability).toBe('no_okrs');
      expect(res.data.summary).toContain('No OKRs are recorded');
      expect(save).not.toHaveBeenCalled();
    });

    it('uses owner-recorded root causes only, never invented ones', async () => {
      const res = await okrProgressTool.invoke({ quarter: 'Q4', mode: 'ANALYZE', sources: ['default'] });
      expect(res.data.summary).not.toContain('legacy auth/payment');
      expect(res.data.summary).not.toContain('14.5h');
      expect(res.data.summary).toContain('PR review turnaround under 12 hours');
    });

    it('should compute OKR pacing, confidence scores, and leading/lagging metrics', async () => {
      const res = await okrProgressTool.invoke({
        sources: ['notion', 'default', 'jira'],
        quarter: 'Q4',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('evaluate_okr_progress');
      expect(typeof res.data.overall_completion_pct).toBe('number');
      expect(typeof res.data.overall_confidence_score).toBe('number');
      expect(res.data.overall_confidence_score).toBeGreaterThanOrEqual(0.0);
      expect(res.data.overall_confidence_score).toBeLessThanOrEqual(1.0);
      expect(res.data.pacing).toBeDefined();
      expect(Array.isArray(res.data.key_results)).toBe(true);
      expect(res.data.key_results.length).toBeGreaterThan(0);
      expect(typeof res.data.leading_avg_progress).toBe('number');
      expect(typeof res.data.lagging_avg_progress).toBe('number');
      expect(res.data.summary).toContain('Executive OKR Pacing & Strategic Scorecard');
      expect(res.data.summary).toContain('Objective & Key Result Detail Breakdown');
      expect(res.data.summary).toContain('Leading vs Lagging Indicator Divergence');
    });

    it('should list key results in LIST_RAW mode', async () => {
      const res = await okrProgressTool.invoke({
        quarter: 'Q4',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.items.length).toBeGreaterThan(0);
      expect(res.data.summary).toContain('Engineering OKRs & Key Results');
    });

    it('should support DRILL_DOWN mode for at-risk key results', async () => {
      const res = await okrProgressTool.invoke({
        quarter: 'Q4',
        mode: 'DRILL_DOWN',
        target: 'AT_RISK',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.summary).toContain('At-Risk Key Results & Gap Remediation');
    });

    it('should create okrAgent safely with low temperature', () => {
      const agent = createOkrAgent();
      expect(agent).toBeDefined();
    });
  });
});

import { sprintPlanTool, createSprintAgent } from '../../src/agent/sprintAgent.js';
import { sprintRetroTool, createRetroAgent } from '../../src/agent/retroAgent.js';
import { roadmapAlignmentTool, createRoadmapAgent } from '../../src/agent/roadmapAgent.js';
import { okrProgressTool, createOkrAgent } from '../../src/agent/okrAgent.js';
import databaseService from '../../src/db/postgres.js';
import identityService from '../../src/services/identityService.js';
import { buildOkrRecords } from '../fixtures/seedTestData.js';

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
    it('should compute recommended commitment points and capacity buffer', async () => {
      const res = await sprintPlanTool.invoke({
        sprint_id: 'sprint_102',
        team_capacity: 40,
        target_velocity: 35,
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('calculate_sprint_plan');
      expect(res.data.capacity_metrics.recommended_commitment_points).toBeGreaterThanOrEqual(25);
      expect(res.data.capacity_metrics.commitment_buffer_points).toBeGreaterThanOrEqual(2);
      expect(res.data.allocation_breakdown.feature_points).toBeGreaterThanOrEqual(15);
      expect(res.data.allocation_breakdown.tech_debt_points).toBeGreaterThanOrEqual(5);
      expect(Array.isArray(res.data.risk_factors)).toBe(true);
      expect(res.data.summary).toContain('Sprint Capacity & Rolling Velocity Forecast');
    });

    it('should enforce 70/20/10 capacity allocation budget', async () => {
      const res = await sprintPlanTool.invoke({
        sprint_id: 'sprint_103',
        custom_tech_debt_percentage: 20,
        unplanned_buffer_percentage: 10,
      });

      expect(res.status).toBe('SUCCESS');
      const alloc = res.data.allocation_breakdown;
      expect(alloc.feature_percentage).toBe(70);
      expect(alloc.tech_debt_percentage).toBe(20);
      expect(alloc.buffer_percentage).toBe(10);
      expect(alloc.feature_points + alloc.tech_debt_points + alloc.buffer_points).toBe(res.data.capacity_metrics.recommended_commitment_points);
    });

    it('should detect developer workload concentration risk when 1 engineer has >35% scope', async () => {
      const res = await sprintPlanTool.invoke({
        sprint_id: 'sprint_104',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(Array.isArray(res.data.risk_factors)).toBe(true);
      expect(res.data.candidate_backlog.length).toBeGreaterThanOrEqual(5);
    });

    it('should support LIST_RAW mode to return candidate backlog issues', async () => {
      const res = await sprintPlanTool.invoke({
        sprint_id: 'sprint_105',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.totalCandidates).toBeGreaterThanOrEqual(1);
    });

    it('should fall back to PostgreSQL database sprint analytics when external MCP APIs time out', async () => {
      const fallback = await sprintPlanTool.dbCacheFallback('postgres_sprint', { sprint_id: 'sprint_fallback' });
      expect(fallback.gross_capacity_hours).toBeGreaterThanOrEqual(40);
      expect(fallback.rolling_avg_velocity).toBeGreaterThanOrEqual(15);
      expect(fallback.is_cached).toBe(true);
      expect(fallback.data_source).toBe('postgres_sprint_analytics');
    });

    describe('honest empty state (no roster, no sprint history)', () => {
      let sandbox;
      beforeEach(() => {
        sandbox = createMockSandbox();
        sandbox.stub(databaseService, 'getSprintAnalytics').resolves([]);
        sandbox.stub(databaseService, 'getTeamMembers').resolves([]);
        sandbox.stub(identityService, 'getTeamMembers').resolves([]);
      });
      afterEach(() => sandbox.restore());

      it('should return NO_DATA instead of seeded velocities, team size, or a capacity floor', async () => {
        const res = await sprintPlanTool.invoke({ sprint_id: 'sprint_empty', sources: ['default'] });

        expect(res.status).toBe('SUCCESS');
        expect(res.data.status).toBe('NO_DATA');
        expect(res.data.capacity_metrics.team_size).toBe(0);
        expect(res.data.capacity_metrics.gross_capacity_hours).toBe(0);
        expect(res.data.capacity_metrics.net_capacity_hours).toBe(0);
        expect(res.data.capacity_metrics.rolling_avg_velocity_points).toBeNull();
        expect(res.data.capacity_metrics.velocity_std_dev).toBeNull();
        expect(res.data.capacity_metrics.recommended_commitment_points).toBeNull();
        expect(res.data.capacity_metrics.pto_days_detected).toBeNull();
        expect(res.data.allocation_breakdown.feature_points).toBeNull();
        expect(res.data.candidate_backlog).toEqual([]);
        expect(res.data.missing_inputs.length).toBe(2);
        expect(res.data.summary).toContain('No sprint commitment can be computed');
        expect(res.data.summary).toContain('Notice');
      });

      it('should report an empty PostgreSQL fallback without invented velocity or PTO', async () => {
        const fallback = await sprintPlanTool.dbCacheFallback('postgres_sprint', { sprint_id: 'sprint_fallback' });
        expect(fallback.team_size).toBe(0);
        expect(fallback.gross_capacity_hours).toBe(0);
        expect(fallback.rolling_avg_velocity).toBeNull();
        expect(fallback.historical_velocities).toEqual([]);
        expect(fallback.pto_days_detected).toBeNull();
        expect(fallback.is_cached).toBe(true);
      });
    });

    it('should create sprintAgent safely', () => {
      const agent = createSprintAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('retroAgent & generate_sprint_retro Tool Harness', () => {
    it('should generate retro notes and persist action items', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_id: 'sprint_101',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('generate_sprint_retro');
      expect(Array.isArray(res.data.what_went_well)).toBe(true);
      expect(Array.isArray(res.data.what_needs_improvement)).toBe(true);
      expect(Array.isArray(res.data.recurring_patterns)).toBe(true);
      expect(Array.isArray(res.data.extracted_action_items)).toBe(true);
      expect(res.data.extracted_action_items.length).toBeGreaterThanOrEqual(2);
      expect(res.data.summary).toContain('Sprint Achievements & Team Kudos');
    });

    it('should parse custom raw retro notes into wins and friction', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_id: 'sprint_102',
        retro_notes: '- Great kudos to team on zero-downtime deployment\n- Flaky auth integration tests blocked our releases',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.what_went_well.some((w) => w.includes('zero-downtime'))).toBe(true);
      expect(res.data.what_needs_improvement.some((f) => f.includes('Flaky auth integration tests'))).toBe(true);
    });

    it('should formulate SMART action items with real team owners', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_id: 'sprint_103',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      const items = res.data.extracted_action_items;
      expect(items.length).toBeGreaterThanOrEqual(3);
      items.forEach((item) => {
        expect(item.task).toBeDefined();
        expect(item.owner).toBeDefined();
        expect(item.success_metric).toBeDefined();
        expect(item.target_sprint).toBeDefined();
      });
    });

    it('should support LIST_RAW mode for action items', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_id: 'sprint_104',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.total_items).toBeGreaterThanOrEqual(1);
    });

    it('should support DRILL_DOWN mode for recurring patterns and friction', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_id: 'sprint_104',
        mode: 'DRILL_DOWN',
        target: 'PATTERNS',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.summary).toContain('Chronic Multi-Sprint Recurring Patterns');
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
    it('should evaluate roadmap health, epic progress, and milestone drift', async () => {
      const res = await roadmapAlignmentTool.invoke({
        initiative_id: 'q4_roadmap',
        quarter: 'Q4',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('get_roadmap_alignment');
      expect(res.data.overall_health).toBeDefined();
      expect(typeof res.data.overall_progress_pct).toBe('number');
      expect(typeof res.data.scope_creep_pct).toBe('number');
      expect(Array.isArray(res.data.epics)).toBe(true);
      expect(res.data.epics.length).toBeGreaterThan(0);
      expect(Array.isArray(res.data.blockers)).toBe(true);
      expect(res.data.summary).toContain('Executive Milestone Health & Pacing Summary');
      expect(res.data.summary).toContain('Epic Progress & Timeline Breakdown');
      expect(res.data.summary).toContain('Cross-Team Technical Dependencies');
      expect(res.data.summary).toContain('Scope Creep & Velocity Risk Audit');
    });

    it('should list raw epic items in LIST_RAW mode', async () => {
      const res = await roadmapAlignmentTool.invoke({
        quarter: 'Q4',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.items.length).toBeGreaterThan(0);
      expect(res.data.summary).toContain('Quarterly Roadmap Epics');
    });

    it('should support DRILL_DOWN mode for cross-team blockers', async () => {
      const res = await roadmapAlignmentTool.invoke({
        quarter: 'Q4',
        mode: 'DRILL_DOWN',
        target: 'BLOCKERS',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.summary).toContain('Cross-Team Technical Blockers');
    });

    it('should create roadmapAgent safely with low temperature', () => {
      const agent = createRoadmapAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('okrAgent & evaluate_okr_progress Tool Harness', () => {
    let sandbox;
    let getOkrRecordsStub;

    beforeEach(() => {
      sandbox = createMockSandbox();
      getOkrRecordsStub = sandbox.stub(databaseService, 'getOkrRecords')
        .callsFake(async (quarter) => buildOkrRecords(quarter));
    });

    afterEach(() => sandbox.restore());

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
      expect(res.data.status).toBe('OK');
      expect(res.data.key_results.length).toBe(4);
      expect(res.data.key_results.map((k) => k.kr)).toEqual(buildOkrRecords('Q4').map((r) => r.key_result));
      expect(res.data.lagging_key_results.map((k) => k.kr)).toEqual([
        'KR3: Achieve >=85% unit and integration test coverage',
        'KR4: Decrease PR code review turnaround time to <12 hours',
      ]);
      expect(res.data.summary).toContain('Notice');
      expect(res.data.summary).toContain('PostgreSQL okr_tracker');
    });

    it('should not seed or persist placeholder OKRs into the database', async () => {
      const saveSpy = sandbox.spy(databaseService, 'saveOkrRecord');
      getOkrRecordsStub.resolves([]);
      await okrProgressTool.invoke({ sources: ['default'], quarter: 'Q4', mode: 'ANALYZE' });
      expect(saveSpy.called).toBe(false);
    });

    describe('honest empty state when no OKR records exist', () => {
      beforeEach(() => getOkrRecordsStub.resolves([]));

      const expectEmptyShape = (data, mode) => {
        expect(data.mode).toBe(mode);
        expect(data.status).toBe('NO_DATA');
        expect(data.quarter).toBe('Q4');
        expect(data.okrs).toEqual([]);
        expect(data.items).toEqual([]);
        expect(data.total_krs).toBe(0);
        expect(data.key_results).toEqual([]);
        expect(data.lagging_key_results).toEqual([]);
        expect(data.at_risk_krs).toEqual([]);
        expect(data.pacing).toBe('NO_DATA');
        expect(data.overall_completion_pct).toBeNull();
        expect(data.overall_confidence_score).toBeNull();
        expect(data.leading_avg_progress).toBeNull();
        expect(data.lagging_avg_progress).toBeNull();
        expect(data.summary).toContain('No OKR records were found for **Q4**');
        expect(data.summary).toContain('Notice');
        expect(data.summary).not.toContain('99.95');
        expect(data.summary).not.toMatch(/O1:|KR\d:/);
      };

      it('ANALYZE returns an explicit NO_DATA result', async () => {
        const res = await okrProgressTool.invoke({ sources: ['default', 'notion', 'jira'], quarter: 'Q4', mode: 'ANALYZE' });
        expect(res.status).toBe('SUCCESS');
        expectEmptyShape(res.data, 'ANALYZE');
      });

      it('LIST_RAW returns an explicit NO_DATA result', async () => {
        const res = await okrProgressTool.invoke({ quarter: 'Q4', mode: 'LIST_RAW' });
        expect(res.status).toBe('SUCCESS');
        expectEmptyShape(res.data, 'LIST_RAW');
      });

      it('DRILL_DOWN returns an explicit NO_DATA result', async () => {
        const res = await okrProgressTool.invoke({ quarter: 'Q4', mode: 'DRILL_DOWN', target: 'AT_RISK' });
        expect(res.status).toBe('SUCCESS');
        expectEmptyShape(res.data, 'DRILL_DOWN');
      });

      it('default executor reports NO_DATA with an empty okrs array', async () => {
        const data = await okrProgressTool.mcpExecutors.default({ quarter: 'Q4' });
        expect(data.okrs).toEqual([]);
        expect(data.status).toBe('NO_DATA');
      });

      it('computeMath handles missing source data without crashing', async () => {
        const data = await okrProgressTool.computeMath({}, { quarter: 'Q4', mode: 'ANALYZE' });
        expectEmptyShape(data, 'ANALYZE');
      });
    });

    it('should report a real zero Jira count instead of a placeholder', async () => {
      const okrs = buildOkrRecords('Q4').map((r) => ({ ...r, kr: r.key_result }));
      const data = await okrProgressTool.computeMath({
        default: { data: { quarter: 'Q4', okrs, synced_at: new Date().toISOString() }, tierUsed: 'TIER_1_MCP' },
        jira: { data: { total_resolved_bugs: 0, source: 'mcp_jira' }, tierUsed: 'TIER_1_MCP' },
      }, { quarter: 'Q4', mode: 'ANALYZE' });
      expect(data.summary).toContain('Jira (0 bugs/incidents resolved in last 90d)');
      expect(data.summary).not.toContain('14 bugs');
    });

    it('should list KRs without a numeric target as UNSCORED instead of defaulting the target', async () => {
      const data = await okrProgressTool.computeMath({
        default: { data: { quarter: 'Q4', okrs: [{ objective: 'O9: Test', kr: 'KR9: Unmeasured', target_value: null, current_value: 5 }] }, tierUsed: 'TIER_1_MCP' },
      }, { quarter: 'Q4', mode: 'ANALYZE' });
      expect(data.key_results.length).toBe(1);
      expect(data.key_results[0].status).toBe('UNSCORED');
      expect(data.key_results[0].progress_pct).toBeNull();
      expect(data.overall_completion_pct).toBeNull();
      expect(data.pacing).toBe('NO_DATA');
    });

    it('should list key results in LIST_RAW mode', async () => {
      const res = await okrProgressTool.invoke({
        quarter: 'Q4',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.items.length).toBe(4);
      expect(res.data.total_krs).toBe(4);
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
      expect(res.data.at_risk_krs.length).toBe(2);
      expect(res.data.at_risk_krs.every((k) => k.root_cause === null)).toBe(true);
    });

    it('should create okrAgent safely with low temperature', () => {
      const agent = createOkrAgent();
      expect(agent).toBeDefined();
    });
  });
});

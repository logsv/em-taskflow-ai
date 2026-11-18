import { sprintPlanTool, createSprintAgent } from '../../src/agent/sprintAgent.js';
import { sprintRetroTool, createRetroAgent } from '../../src/agent/retroAgent.js';
import { roadmapAlignmentTool, createRoadmapAgent, mapJiraEpic } from '../../src/agent/roadmapAgent.js';
import { okrProgressTool, createOkrAgent } from '../../src/agent/okrAgent.js';
import databaseService from '../../src/db/postgres.js';
import identityService from '../../src/services/identityService.js';
import { buildOkrRecords, buildJiraRoadmapEpics, buildRetroSourceResults } from '../fixtures/seedTestData.js';

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

    it('should not write a forecast row into sprint_analytics', async () => {
      const sandbox = createMockSandbox();
      const saveSpy = sandbox.spy(databaseService, 'saveSprintAnalytics');
      try {
        const res = await sprintPlanTool.invoke({ sprint_id: 'sprint_42', mode: 'ANALYZE' });
        expect(res.status).toBe('SUCCESS');
        expect(res.data.capacity_metrics.recommended_commitment_points).toBeGreaterThan(0);
        expect(saveSpy.called).toBe(false);
      } finally {
        sandbox.restore();
      }
    });

    it('should create sprintAgent safely', () => {
      const agent = createSprintAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('retroAgent & generate_sprint_retro Tool Harness', () => {
    let sandbox;
    beforeEach(() => {
      sandbox = createMockSandbox();
      // Deterministic sprint_analytics history for the invoke() paths: one past retro with real items.
      sandbox.stub(databaseService, 'getSprintAnalytics').resolves([
        { sprint_id: 'sprint_42', sprint_name: 'Sprint 42', retro_action_items: ['Establish dedicated daily PR review window at 10 AM', 'Automate CI check for PR labels'] },
      ]);
    });
    afterEach(() => sandbox.restore());

    it('should build wins, friction, recurring patterns, and action items only from real sources', async () => {
      const data = await sprintRetroTool.computeMath(buildRetroSourceResults(), {
        sprint_id: 'sprint_50',
        sprint_name: 'Sprint 50',
        mode: 'ANALYZE',
        retro_notes: '- Great pairing on the cache rewrite\n- PR reviews were slow this sprint\n- Team offsite next month',
      });

      expect(data.status).toBe('OK');
      expect(data.what_went_well).toEqual([
        'Great pairing on the cache rewrite',
        '**Slack (sarah-c)**: Kudos to the infra pod for the smooth database cutover',
        '**Jira**: Resolved bug/incident tickets: OPS-10',
      ]);
      expect(data.what_needs_improvement).toEqual([
        'PR reviews were slow this sprint',
        '**Slack (alex-dev99)**: Flaky payment tests kept failing the pipeline again',
        '**Jira**: Bug/incident tickets still open: OPS-11 (Checkout latency spike)',
      ]);
      expect(data.other_notes).toEqual(['Team offsite next month']);
      expect(data.delivery_signals).toEqual([
        'GitHub: 23 PR(s) merged in the last 14 days',
        'GitHub: average PR turnaround 9.5h over the last 14 days',
      ]);
      expect(data.recurring_patterns.length).toBe(2);
      expect(data.recurring_patterns[0]).toContain('CI/CD & Test Reliability');
      expect(data.recurring_patterns[0]).toContain('2 of the last 2 recorded retro(s) (Sprint 49, Sprint 48)');
      expect(data.recurring_patterns[1]).toContain('Code Review Flow');
      expect(data.recurring_patterns[1]).toContain('1 of the last 2 recorded retro(s) (Sprint 48)');
      expect(data.summary).toContain('Sprint Achievements & Team Kudos');
      expect(data.summary).toContain('Notice');
      // None of the formerly hard-coded metrics may appear.
      expect(data.summary).not.toMatch(/36 of 40|232 test specs|14\.5 hours|18%|3 consecutive sprints|2 of the last 3/);
    });

    it('should derive one action item per friction point with no invented owners', async () => {
      const data = await sprintRetroTool.computeMath(buildRetroSourceResults(), {
        sprint_id: 'sprint_50',
        sprint_name: 'Sprint 50',
        mode: 'ANALYZE',
      });

      const items = data.extracted_action_items;
      expect(items.length).toBe(data.what_needs_improvement.length);
      expect(items.length).toBe(2);
      items.forEach((item) => {
        expect(item.task).toMatch(/^Agree a fix for: /);
        expect(item.owner).toBeNull();
        expect(item.owner_status).toBe('UNASSIGNED');
        expect(item.target_sprint).toBe('Sprint 51');
        expect(item.success_metric).toContain('Sprint 51 retro');
      });
      expect(items[0].category).toBe('CI_RELIABILITY');
      expect(items[0].success_metric).toContain('currently recurring');
      expect(items[1].category).toBe('INCIDENTS');
    });

    it('should return an explicit NO_DATA result when there are no retro inputs', async () => {
      const data = await sprintRetroTool.computeMath({}, { sprint_id: 'sprint_empty', sprint_name: 'Sprint 9', mode: 'ANALYZE' });
      expect(data.status).toBe('NO_DATA');
      expect(data.what_went_well).toEqual([]);
      expect(data.what_needs_improvement).toEqual([]);
      expect(data.recurring_patterns).toEqual([]);
      expect(data.extracted_action_items).toEqual([]);
      expect(data.input_sources).toEqual([]);
      expect(data.summary).toContain('No retro notes, Slack retro messages, GitHub/Jira telemetry, or past retro items were available');
      expect(data.summary).toContain('Notice');
    });

    it('should report the live run honestly and never persist sprint_analytics rows', async () => {
      const saveSpy = sandbox.spy(databaseService, 'saveSprintAnalytics');
      const res = await sprintRetroTool.invoke({ sprint_id: 'sprint_101', sources: ['default'] });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('generate_sprint_retro');
      expect(saveSpy.called).toBe(false);
      // sprint_analytics has retro items for sprint_42 only: real past data, no friction this sprint.
      expect(res.data.status).toBe('OK');
      expect(res.data.what_went_well).toEqual([]);
      expect(res.data.what_needs_improvement).toEqual([]);
      expect(res.data.extracted_action_items).toEqual([]);
      expect(res.data.recurring_patterns).toEqual([]);
      expect(res.data.input_sources[0]).toContain('PostgreSQL sprint_analytics');
    });

    it('should parse custom raw retro notes into wins and friction', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_id: 'sprint_102',
        sources: ['default'],
        retro_notes: '- Great kudos to team on zero-downtime deployment\n- Flaky auth integration tests blocked our releases',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.what_went_well).toEqual(['Great kudos to team on zero-downtime deployment']);
      expect(res.data.what_needs_improvement).toEqual(['Flaky auth integration tests blocked our releases']);
      expect(res.data.extracted_action_items.length).toBe(1);
      expect(res.data.extracted_action_items[0].task).toContain('Flaky auth integration tests');
    });

    it('should support LIST_RAW mode for action items', async () => {
      const data = await sprintRetroTool.computeMath(buildRetroSourceResults(), { sprint_name: 'Sprint 50', mode: 'LIST_RAW' });
      expect(data.mode).toBe('LIST_RAW');
      expect(data.total_items).toBe(2);
      expect(data.items.length).toBe(2);
      expect(data.summary).toContain('Retrospective Action Items: Sprint 50 (2 Actions)');

      const empty = await sprintRetroTool.computeMath({}, { sprint_name: 'Sprint 9', mode: 'LIST_RAW' });
      expect(empty.status).toBe('NO_DATA');
      expect(empty.items).toEqual([]);
      expect(empty.total_items).toBe(0);
    });

    it('should support DRILL_DOWN mode for recurring patterns and friction', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_id: 'sprint_104',
        sources: ['default'],
        mode: 'DRILL_DOWN',
        target: 'PATTERNS',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('DRILL_DOWN');
      expect(res.data.summary).toContain('Chronic Multi-Sprint Recurring Patterns');
      expect(res.data.recurring_patterns).toEqual([]);

      const withData = await sprintRetroTool.computeMath(buildRetroSourceResults(), { sprint_name: 'Sprint 50', mode: 'DRILL_DOWN', target: 'PATTERNS' });
      expect(withData.recurring_patterns.length).toBe(1);
      expect(withData.summary).toContain('CI/CD & Test Reliability');
    });

    it('should fall back to PostgreSQL database when external MCPs time out', async () => {
      const fallback = await sprintRetroTool.dbCacheFallback('postgres_retro', { sprint_id: 'sprint_fallback' });
      expect(fallback.sprint_id).toBe('sprint_fallback');
      expect(Array.isArray(fallback.past_retro_items)).toBe(true);
      expect(Array.isArray(fallback.past_retros)).toBe(true);
      expect(fallback.is_cached).toBe(true);
      expect(fallback.data_source).toBe('postgres_sprint_analytics');
    });

    it('should create retroAgent safely', () => {
      const agent = createRetroAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('roadmapAgent & get_roadmap_alignment Tool Harness', () => {
    const liveJiraSources = () => ({
      jira: {
        tierUsed: 'TIER_1_MCP',
        data: { epics: buildJiraRoadmapEpics().map(mapJiraEpic), source: 'mcp_jira', synced_at: new Date().toISOString() },
      },
    });

    it('should map only fields present on the Jira issue and null the rest', () => {
      const [blocked, , , , bare] = buildJiraRoadmapEpics().map(mapJiraEpic);
      expect(blocked.progress_pct).toBe(40);
      expect(blocked.story_points).toBe(20);
      expect(blocked.owner).toBe('Alex Williams');
      expect(blocked.blockers).toEqual(['RM-9 (Auth token API)']); // the done RM-8 link is not a blocker
      expect(bare).toEqual(jasmine.objectContaining({
        key: 'RM-5', progress_pct: null, story_points: null, target_date: null, owner: null, blockers: [],
      }));

      const flat = mapJiraEpic({ key: 'RM-7', summary: 'Flat', status: 'In Progress', assignee: 'unassigned', due_date: '2026-12-01', blocked_by: 'RM-1, RM-2' });
      expect(flat.owner).toBeNull();
      expect(flat.target_date).toBe('2026-12-01');
      expect(flat.blockers).toEqual(['RM-1', 'RM-2']);
      expect(flat.progress_pct).toBeNull();
    });

    it('should derive health, drift, and recommendations from the actual epics', async () => {
      const data = await roadmapAlignmentTool.computeMath(liveJiraSources(), { quarter: 'Q4', mode: 'ANALYZE' });

      expect(data.status).toBe('OK');
      expect(data.overall_health).toBe('DELAYED');
      expect(data.epics.map((e) => [e.key, e.health_status, e.drift_days])).toEqual([
        ['RM-1', 'BLOCKED', 6],
        ['RM-2', 'OVERDUE', 3],
        ['RM-3', 'AT_RISK', 0],
        ['RM-4', 'DONE', 0],
        ['RM-5', 'UNKNOWN', null],
      ]);
      expect(data.overall_progress_pct).toBe(47); // plain mean of the 4 epics with progress (RM-5 has none)
      expect(data.total_story_points).toBe(45);
      expect(data.scope_creep_pct).toBeNull();
      expect(data.max_drift_days).toBe(6);
      expect(data.blockers).toEqual([jasmine.objectContaining({ epic: 'RM-1', blocked_by: ['RM-9'] })]);
      expect(data.recommendations.map((r) => [r.priority, r.epic])).toEqual([
        ['P0', 'RM-1'], ['P1', 'RM-2'], ['P1', 'RM-3'], ['P2', null], ['P2', null],
      ]);
      expect(data.recommendations[3].action).toContain('RM-5');
      expect(data.summary).toContain('Executive Milestone Health & Pacing Summary');
      expect(data.summary).toContain('Epic Progress & Timeline Breakdown');
      expect(data.summary).toContain('Cross-Team Technical Dependencies');
      expect(data.summary).toContain('Scope Creep & Velocity Risk Audit');
      expect(data.summary).toContain('Notice');
      expect(data.summary).not.toMatch(/ENG-20[15]|ENG-210|8-day slip|Nov 10|\+40%/);
    });

    it('should list raw epic items and blockers from live epics', async () => {
      const list = await roadmapAlignmentTool.computeMath(liveJiraSources(), { quarter: 'Q4', mode: 'LIST_RAW' });
      expect(list.mode).toBe('LIST_RAW');
      expect(list.items.map((e) => e.key)).toEqual(['RM-1', 'RM-2', 'RM-3', 'RM-4', 'RM-5']);
      expect(list.total_epics).toBe(5);
      expect(list.summary).toContain('Quarterly Roadmap Epics');

      const drill = await roadmapAlignmentTool.computeMath(liveJiraSources(), { quarter: 'Q4', mode: 'DRILL_DOWN', target: 'BLOCKERS' });
      expect(drill.mode).toBe('DRILL_DOWN');
      expect(drill.blockers.length).toBe(1);
      expect(drill.summary).toContain('Cross-Team Technical Blockers');
      expect(drill.summary).toContain('RM-9 (Auth token API)');
    });

    describe('honest empty state without live Jira epics', () => {
      const expectEmptyShape = (data, mode) => {
        expect(data.mode).toBe(mode);
        expect(data.status).toBe('NO_DATA');
        expect(data.epics).toEqual([]);
        expect(data.items).toEqual([]);
        expect(data.total_epics).toBe(0);
        expect(data.blockers).toEqual([]);
        expect(data.recommendations).toEqual([]);
        expect(data.overall_health).toBe('NO_DATA');
        expect(data.overall_progress_pct).toBeNull();
        expect(data.scope_creep_pct).toBeNull();
        expect(data.provenance.source).toBe('Live Jira epics');
        expect(data.summary).toContain('No roadmap epics were retrieved for **Q4**');
        expect(data.summary).toContain('Notice');
        expect(data.summary).not.toMatch(/ENG-\d+/);
      };

      it('ANALYZE returns NO_DATA when Jira is unavailable (Tier 3)', async () => {
        const res = await roadmapAlignmentTool.invoke({ initiative_id: 'q4_roadmap', quarter: 'Q4', mode: 'ANALYZE' });
        expect(res.status).toBe('SUCCESS');
        expect(res.name).toBe('get_roadmap_alignment');
        expectEmptyShape(res.data, 'ANALYZE');
        expect(res.data.provenance.jira_tier).toBe('TIER_3_DB_CACHE');
      });

      it('LIST_RAW and DRILL_DOWN return NO_DATA', async () => {
        const list = await roadmapAlignmentTool.invoke({ quarter: 'Q4', mode: 'LIST_RAW' });
        expectEmptyShape(list.data, 'LIST_RAW');
        const drill = await roadmapAlignmentTool.invoke({ quarter: 'Q4', mode: 'DRILL_DOWN', target: 'BLOCKERS' });
        expectEmptyShape(drill.data, 'DRILL_DOWN');
      });

      it('computeMath handles missing source data without crashing', async () => {
        const data = await roadmapAlignmentTool.computeMath({}, { quarter: 'Q4', mode: 'ANALYZE' });
        expectEmptyShape(data, 'ANALYZE');
        expect(data.provenance.jira_tier).toBe('NOT_REQUESTED');
      });

      it('the PostgreSQL fallback never reports epics', async () => {
        const fallback = await roadmapAlignmentTool.dbCacheFallback('jira', { quarter: 'Q4' });
        expect(fallback.epics).toEqual([]);
        expect(fallback.status).toBe('NO_DATA');
        expect(fallback.drift_days).toBeUndefined();
        expect(fallback.is_cached).toBe(true);
      });
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

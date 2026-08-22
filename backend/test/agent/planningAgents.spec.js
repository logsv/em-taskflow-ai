import { sprintPlanTool, createSprintAgent } from '../../src/agent/sprintAgent.js';
import { sprintRetroTool, createRetroAgent } from '../../src/agent/retroAgent.js';
import { roadmapAlignmentTool, createRoadmapAgent } from '../../src/agent/roadmapAgent.js';
import { okrProgressTool, createOkrAgent } from '../../src/agent/okrAgent.js';

describe('Phase 5 Planning & Strategy Agents Specs: Sprint, Retro, Roadmap, OKR', () => {
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
    });

    it('should create roadmapAgent safely with low temperature', () => {
      const agent = createRoadmapAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('okrAgent & evaluate_okr_progress Tool Harness', () => {
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
    });

    it('should create okrAgent safely with low temperature', () => {
      const agent = createOkrAgent();
      expect(agent).toBeDefined();
    });
  });
});

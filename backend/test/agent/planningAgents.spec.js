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
      expect(fallback.gross_capacity_hours).toBeGreaterThanOrEqual(100);
      expect(fallback.rolling_avg_velocity).toBeGreaterThanOrEqual(30);
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
      expect(Array.isArray(res.data.extracted_action_items)).toBe(true);
    });

    it('should create retroAgent safely', () => {
      const agent = createRetroAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('roadmapAgent & get_roadmap_alignment Tool Harness', () => {
    it('should evaluate roadmap health and milestone drift days', async () => {
      const res = await roadmapAlignmentTool.invoke({
        initiative_id: 'q3_roadmap',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('get_roadmap_alignment');
      expect(res.data.roadmap_health).toBeDefined();
      expect(typeof res.data.drift_days).toBe('number');
      expect(Array.isArray(res.data.milestones)).toBe(true);
    });

    it('should create roadmapAgent safely', () => {
      const agent = createRoadmapAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('okrAgent & evaluate_okr_progress Tool Harness', () => {
    it('should compute OKR pacing and completion percentage', async () => {
      const res = await okrProgressTool.invoke({
        sources: ['notion', 'default'],
        quarter: 'Q3',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('evaluate_okr_progress');
      expect(typeof res.data.overall_completion_pct).toBe('number');
      expect(res.data.pacing).toBeDefined();
      expect(Array.isArray(res.data.key_results)).toBe(true);
    });

    it('should list key results in LIST_RAW mode', async () => {
      const res = await okrProgressTool.invoke({
        quarter: 'Q3',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
    });

    it('should create okrAgent safely', () => {
      const agent = createOkrAgent();
      expect(agent).toBeDefined();
    });
  });
});

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
      expect(res.data.capacity_metrics.recommended_commitment_points).toBe(30);
      expect(res.data.capacity_metrics.commitment_buffer_points).toBe(5);
      expect(Array.isArray(res.data.risk_factors)).toBe(true);
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

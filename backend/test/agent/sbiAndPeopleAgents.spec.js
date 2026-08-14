import { sbiFeedbackTool, createSbiAgent } from '../../src/agent/sbiAgent.js';
import { peopleGrowthTool, createPeopleAgent } from '../../src/agent/peopleAgent.js';

describe('Phase 4 People & Performance Agents Specs: SBI & People Harnesses', () => {
  describe('sbiAgent & format_sbi_feedback Tool Harness', () => {
    it('should format structured Situation-Behavior-Impact feedback in ANALYZE mode', async () => {
      const res = await sbiFeedbackTool.invoke({
        engineer_id: 'eng_alex',
        situation: 'During Sprint 14 retro',
        behavior: 'Volunteered for critical bug fix',
        impact: 'Saved 5 hours downtime',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('format_sbi_feedback');
      expect(res.data.framework).toContain('Situation-Behavior-Impact');
      expect(res.data.structured_feedback.situation).toContain('Sprint 14');
      expect(res.data.structured_feedback.behavior).toContain('bug fix');
      expect(res.data.structured_feedback.impact).toContain('downtime');
    });

    it('should retrieve raw feedback history in LIST_RAW mode', async () => {
      const res = await sbiFeedbackTool.invoke({
        engineer_id: 'eng_alex',
        mode: 'LIST_RAW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
    });

    it('should create sbiAgent instance safely', () => {
      const agent = createSbiAgent();
      expect(agent).toBeDefined();
    });
  });

  describe('peopleAgent & analyze_personnel_growth Tool Harness', () => {
    it('should compute burnout risk and promotion readiness in ANALYZE mode', async () => {
      const res = await peopleGrowthTool.invoke({
        engineer_id: 'eng_alex',
        review_period: 'Q3',
        mode: 'ANALYZE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('analyze_personnel_growth');
      expect(res.data.mode).toBe('ANALYZE');
      expect(res.data.metrics.burnout_risk_score).toBeDefined();
      expect(Array.isArray(res.data.one_on_one_agenda)).toBe(true);
    });

    it('should list calendar events in LIST_RAW mode', async () => {
      const res = await peopleGrowthTool.invoke({
        sources: ['google'],
        mode: 'LIST_RAW',
        filter: 'TODAY_EVENTS',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(Array.isArray(res.data.items)).toBe(true);
    });

    it('should create peopleAgent instance safely', () => {
      const agent = createPeopleAgent();
      expect(agent).toBeDefined();
    });
  });
});

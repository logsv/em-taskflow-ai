import { doraMetricsTool, createDoraAgent } from '../../src/agent/doraAgent.js';
import { deliveryBottlenecksTool, createDeliveryAgent } from '../../src/agent/deliveryAgent.js';

describe('Phase 3 Core Analytics Agents Specs: DORA & Delivery Harnesses', () => {
  describe('doraAgent & calculate_dora_metrics Tool Harness', () => {
    it('should compute exact DORA math rating and metrics in ANALYZE mode', async () => {
      const res = await doraMetricsTool.invoke({
        time_window: '30d',
        team_id: 'frontend_team',
        repo_id: 'em-taskflow-ai',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('calculate_dora_metrics');
      expect(res.data.rating).toBeDefined();
      if (res.data.rating === 'UNAVAILABLE') {
        expect(res.data.metrics).toBeNull();
        expect(res.data.data_availability).toBe('no_dora_snapshot');
      } else {
        expect(res.data.metrics.deployment_frequency).toContain('deploys/week');
        expect(typeof res.data.metrics.lead_time_hours).toBe('number');
        expect(typeof res.data.metrics.change_failure_rate_pct).toBe('number');
      }
    });

    it('should create doraAgent with custom or default tools', () => {
      const agent = createDoraAgent();
      expect(agent).toBeDefined();
    });

    it('should not assign an implicit default team or repository', () => {
      const parsed = doraMetricsTool.schema.parse({});
      expect(parsed.team_id).toBeUndefined();
      expect(parsed.repo_id).toBeUndefined();
    });
  });

  describe('deliveryAgent & analyze_delivery_bottlenecks Tool Harness', () => {
    it('should compute delivery risk and WIP metrics in ANALYZE mode', async () => {
      const res = await deliveryBottlenecksTool.invoke({
        sources: ['github', 'jira'],
        mode: 'ANALYZE',
        sprint_id: 'sprint_101',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.name).toBe('analyze_delivery_bottlenecks');
      expect(res.data.mode).toBe('ANALYZE');
      expect(res.data.delivery_risk_index).toBeDefined();
      if (res.data.delivery_risk_index === 'UNAVAILABLE') {
        expect(res.data.metrics).toBeNull();
        expect(res.data.data_availability).toBe('empty');
      } else {
        expect(res.data.metrics.wip_violations).toBeDefined();
      }
      expect(res.sourcesExecuted).toEqual(['github', 'jira']);
    });

    it('should return raw list of missed-deadline tickets in LIST_RAW mode', async () => {
      const res = await deliveryBottlenecksTool.invoke({
        sources: ['jira'],
        mode: 'LIST_RAW',
        filter: 'MISSED_DEADLINE',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(res.data.filter).toBe('MISSED_DEADLINE');
      expect(Array.isArray(res.data.items)).toBe(true);
    });

    it('should create deliveryAgent with custom or default tools', () => {
      const agent = createDeliveryAgent();
      expect(agent).toBeDefined();
    });
  });
});

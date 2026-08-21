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
        expect(res.data.summary).toContain('DORA Metrics Unavailable');
      } else {
        expect(res.data.metrics.deployment_frequency).toContain('deploys/week');
        expect(typeof res.data.metrics.lead_time_hours).toBe('number');
        expect(typeof res.data.metrics.change_failure_rate_pct).toBe('number');
        expect(typeof res.data.metrics.mttr_hours).toBe('number');
        expect(res.data.bottlenecks).toBeDefined();
        expect(Array.isArray(res.data.bottlenecks)).toBe(true);
        expect(res.data.summary).toContain('DORA Performance Scorecard');
      }
    });

    it('should enforce anti-vanity principles by omitting individual contributor rankings in summary', async () => {
      const res = await doraMetricsTool.invoke({
        time_window: '30d',
        team_id: 'platform_team',
        repo_id: 'em-taskflow-ai',
      });

      expect(res.status).toBe('SUCCESS');
      // Anti-vanity verification: summary should not contain individual stack ranking
      expect(res.data.summary).not.toContain('Top Contributor:');
      expect(res.data.summary).not.toContain('Worst Developer:');
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
    it('should compute delivery risk and WIP metrics in ANALYZE mode with github, jira, and notion sources', async () => {
      const res = await deliveryBottlenecksTool.invoke({
        sources: ['github', 'jira', 'notion'],
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
        expect(typeof res.data.metrics.wip_violations).toBe('number');
        expect(res.data.summary).toContain('Delivery Bottleneck Scorecard');
      }
      expect(res.sourcesExecuted).toEqual(['github', 'jira', 'notion']);
    });

    it('should enforce anti-vanity principles in delivery summary by omitting developer shaming', async () => {
      const res = await deliveryBottlenecksTool.invoke({
        sources: ['github', 'jira'],
        mode: 'ANALYZE',
        sprint_id: 'sprint_101',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.summary).not.toContain('Slowest Developer:');
      expect(res.data.summary).not.toContain('Worst Performer:');
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

    it('should return raw list of stalled reviews in LIST_RAW mode', async () => {
      const res = await deliveryBottlenecksTool.invoke({
        sources: ['github'],
        mode: 'LIST_RAW',
        filter: 'STALLED_REVIEW',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.mode).toBe('LIST_RAW');
      expect(res.data.filter).toBe('STALLED_REVIEW');
      expect(Array.isArray(res.data.items)).toBe(true);
    });

    it('should create deliveryAgent with custom or default tools', () => {
      const agent = createDeliveryAgent();
      expect(agent).toBeDefined();
    });
  });
});

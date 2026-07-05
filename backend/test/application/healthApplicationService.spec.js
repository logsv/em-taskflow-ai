import { HealthApplicationService } from '../../src/application/health/HealthApplicationService.js';

describe('HealthApplicationService', () => {
  it('builds the normalized health payload from runtime and agent status', async () => {
    const agent = {
      getStatus: jasmine.createSpy('getStatus').and.resolveTo({
        ready: true,
        mcpReady: false,
        ragEnabled: true,
        runtimeMode: 'full',
      }),
    };
    const service = new HealthApplicationService({
      agent,
      runtimeConfigProvider: () => ({ mode: 'full' }),
    });

    const result = await service.getHealth({ requestId: 'req_health' });

    expect(agent.getStatus).toHaveBeenCalled();
    expect(result.status).toBe('healthy');
    expect(result.runtimeMode).toBe('full');
    expect(result.services).toEqual({
      database: 'healthy',
      agent: 'healthy',
      mcp: 'degraded',
      rag: 'healthy',
    });
    expect(result.requestId).toBe('req_health');
    expect(typeof result.timestamp).toBe('string');
  });

  it('falls back to degraded agent status when agent status lookup throws in health mode', async () => {
    const agent = {
      getStatus: jasmine.createSpy('getStatus').and.rejectWith(new Error('agent unavailable')),
    };
    const service = new HealthApplicationService({
      agent,
      runtimeConfigProvider: () => ({ mode: 'full' }),
    });

    const result = await service.getHealth({ requestId: 'req_health_fallback' });

    expect(result.services).toEqual({
      database: 'healthy',
      agent: 'degraded',
      mcp: 'degraded',
      rag: 'degraded',
    });
  });

  it('returns router metrics payload from agent status', async () => {
    const agent = {
      getStatus: jasmine.createSpy('getStatus').and.resolveTo({
        runtimeMode: 'full',
        router: {
          metrics: { totalQueries: 3 },
        },
      }),
    };
    const service = new HealthApplicationService({
      agent,
      runtimeConfigProvider: () => ({ mode: 'full' }),
    });

    const result = await service.getRouterMetrics({ requestId: 'req_router' });

    expect(result).toEqual({
      runtimeMode: 'full',
      router: {
        metrics: { totalQueries: 3 },
      },
      requestId: 'req_router',
      timestamp: jasmine.any(String),
    });
  });
});

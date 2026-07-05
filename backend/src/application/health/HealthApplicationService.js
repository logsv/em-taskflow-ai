import agentService from '../../services/agentService.js';
import { getRuntimeConfig } from '../../config.js';

export class HealthApplicationService {
  constructor({
    agent = agentService,
    runtimeConfigProvider = getRuntimeConfig,
  } = {}) {
    this.agentService = agent;
    this.getRuntimeConfig = runtimeConfigProvider;
  }

  async getHealth({ requestId = null }) {
    const runtimeConfig = this.getRuntimeConfig();
    const agentStatus = await this.agentService.getStatus().catch(() => ({
      ready: false,
      mcpReady: false,
      ragEnabled: false,
    }));

    return {
      status: 'healthy',
      runtimeMode: runtimeConfig.mode,
      services: {
        database: 'healthy',
        agent: agentStatus.ready ? 'healthy' : 'degraded',
        mcp: agentStatus.mcpReady ? 'healthy' : 'degraded',
        rag: agentStatus.ragEnabled ? 'healthy' : 'degraded',
      },
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  async getRouterMetrics({ requestId = null }) {
    const status = await this.agentService.getStatus();
    return {
      runtimeMode: status.runtimeMode,
      router: status.router || null,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }
}

const healthApplicationService = new HealthApplicationService();
export default healthApplicationService;

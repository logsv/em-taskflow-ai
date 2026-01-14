/**
 * Agent module - LangGraph ReAct agent with MCP tools
 * Centralized access to agent functionality
 */

export {
  initializeAgent,
  executeAgentQuery,
  checkAgentReadiness,
  getAgentTools,
  getAgentInstance,
  resetAgent,
} from './graph.js';

export { default as agentRouter } from './server.js';

import {
  initializeAgent,
  executeAgentQuery,
  checkAgentReadiness,
  getAgentTools,
} from './graph.js';

export class LangGraphAgentService {
  initialized = false;

  async initialize() {
    if (this.initialized) return;
    await initializeAgent();
    this.initialized = true;
  }

  async processQuery(userQuery, options) {
    await this.ensureInitialized();

    const result = await executeAgentQuery(userQuery, {
      maxIterations: options?.maxIterations || 10,
      stream: options?.stream || false,
    });

    if (typeof result === 'string') {
      return result;
    }

    return 'Streaming response - use the streaming endpoint';
  }

  async *streamQuery(userQuery, options) {
    await this.ensureInitialized();

    try {
      const stream = (await executeAgentQuery(userQuery, {
        maxIterations: options?.maxIterations || 10,
        stream: true,
      }));

      for await (const chunk of stream) {
        if (chunk.agent) {
          yield {
            type: 'thinking',
            content: 'Agent is reasoning...',
            data: chunk.agent,
          };
        } else if (chunk.tools) {
          yield {
            type: 'tool_use',
            content: 'Using tools...',
            data: chunk.tools,
          };
        }
      }

      yield {
        type: 'final',
        content: 'Query processing completed.',
      };
    } catch (error) {
      yield {
        type: 'final',
        content: `Error: ${error.message}`,
      };
    }
  }

  async getStatus() {
    const readiness = await checkAgentReadiness();

    return {
      ready: this.initialized && readiness.ready,
      toolCount: readiness.toolCount,
      ragEnabled: true,
      model: readiness.model,
      error: readiness.error,
    };
  }

  async getAvailableTools() {
    try {
      const { toolInfo } = await getAgentTools();
      return toolInfo;
    } catch (error) {
      console.error('Failed to get available tools:', error);
      return [];
    }
  }

  isReady() {
    return this.initialized;
  }

  async restart() {
    console.log('🔄 Restarting LangGraph Agent Service...');
    this.initialized = false;
    await this.initialize();
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

const langGraphAgentService = new LangGraphAgentService();
export default langGraphAgentService;


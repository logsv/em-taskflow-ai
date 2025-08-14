/**
 * Agent module - LangGraph ReAct agent with MCP tools
 * Centralized access to agent functionality
 */

// Re-export graph functionality
export {
  initializeAgent,
  executeAgentQuery,
  checkAgentReadiness,
  getAgentTools,
  getAgentInstance,
  resetAgent,
} from './graph.js';

// Re-export server routes
export { default as agentRouter } from './server.js';

// Legacy service wrapper for backward compatibility
import { 
  initializeAgent, 
  executeAgentQuery, 
  checkAgentReadiness, 
  getAgentTools 
} from './graph.js';

/**
 * Legacy Agent Service interface for backward compatibility
 */
export class LangGraphAgentService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await initializeAgent();
    this.initialized = true;
  }

  async processQuery(
    userQuery: string,
    options?: {
      maxIterations?: number;
      includeRAG?: boolean;
      stream?: boolean;
    }
  ): Promise<string> {
    await this.ensureInitialized();
    
    const result = await executeAgentQuery(userQuery, {
      maxIterations: options?.maxIterations || 10,
      stream: options?.stream || false,
    });

    // For non-streaming, return the string result
    if (typeof result === 'string') {
      return result;
    }

    // For streaming, this should be handled differently in the calling code
    return 'Streaming response - use the streaming endpoint';
  }

  async *streamQuery(
    userQuery: string,
    options?: {
      maxIterations?: number;
      includeRAG?: boolean;
    }
  ): AsyncGenerator<{
    type: 'thinking' | 'tool_use' | 'response' | 'final';
    content: string;
    toolName?: string;
    data?: any;
  }> {
    await this.ensureInitialized();

    try {
      const stream = await executeAgentQuery(userQuery, {
        maxIterations: options?.maxIterations || 10,
        stream: true,
      }) as AsyncIterable<any>;

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
        content: `Error: ${(error as Error).message}`,
      };
    }
  }

  async getStatus(): Promise<{
    ready: boolean;
    toolCount: number;
    ragEnabled: boolean;
    model: string;
    error?: string;
  }> {
    const readiness = await checkAgentReadiness();
    
    return {
      ready: this.initialized && readiness.ready,
      toolCount: readiness.toolCount,
      ragEnabled: true, // Always true in new structure
      model: readiness.model,
      error: readiness.error,
    };
  }

  async getAvailableTools(): Promise<Array<{
    name: string;
    description: string;
    parameters: any;
  }>> {
    try {
      const { toolInfo } = await getAgentTools();
      return toolInfo;
    } catch (error) {
      console.error('Failed to get available tools:', error);
      return [];
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  async restart(): Promise<void> {
    console.log('🔄 Restarting LangGraph Agent Service...');
    this.initialized = false;
    await this.initialize();
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance for backward compatibility
const langGraphAgentService = new LangGraphAgentService();
export default langGraphAgentService;
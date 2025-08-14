import { ResilientRouter, type LLMRequest, type LLMResponse, type RouterConfig, type LLMProviderConfig } from 'llm-router';
import type { Tool } from '@langchain/core/tools';
import mcpService from './mcpService.js';
import { config, toLlmRouterConfig, getLlmConfig } from '../config.js';

// Enhanced LLM Router with MCP integration
class EnhancedLLMRouter {
  private router: ResilientRouter;
  private tools: Tool[] = [];

  constructor(router: ResilientRouter) {
    this.router = router;
  }

  static async create(): Promise<EnhancedLLMRouter> {
    console.log('🔧 Creating Enhanced LLM Router...');
    
    // Get router configuration
    const routerConfig = toLlmRouterConfig();
    console.log('📋 Router config:', JSON.stringify(routerConfig, null, 2));
    
    // Create resilient router
    const router = new ResilientRouter(routerConfig);
    const instance = new EnhancedLLMRouter(router);
    
    // Initialize MCP tools
    await instance.initializeMCPTools();
    
    console.log('✅ Enhanced LLM Router created successfully');
    return instance;
  }

  private async initializeMCPTools(): Promise<void> {
    try {
      if (!mcpService.isReady()) {
        await mcpService.initialize();
      }
      this.tools = mcpService.getTools();
      console.log(`📋 Loaded ${this.tools.length} MCP tools for LLM Router`);
    } catch (error) {
      console.warn('⚠️  Failed to load MCP tools:', error);
      this.tools = [];
    }
  }

  async executeMCPQuery(query: string, maxSteps: number = 20): Promise<string> {
    try {
      // Use the new MCP service for query execution
      if (mcpService.isReady()) {
        return await mcpService.runQuery(query);
      } else {
        // Fallback to standard LLM routing
        const request: LLMRequest = {
          prompt: query,
          messages: [{ role: 'user', content: query }],
          model: getLlmConfig().defaultModel,
          maxTokens: 1000,
        };
        
        const response = await this.router.route(request);
        return response.text;
      }
    } catch (error) {
      console.error('❌ MCP query execution failed:', error);
      throw error;
    }
  }

  async route(request: LLMRequest): Promise<LLMResponse> {
    return await this.router.route(request);
  }

  async healthCheck(): Promise<any> {
    const mcpHealth = await mcpService.getHealthStatus();
    
    return {
      router: { status: 'healthy' },
      mcp: mcpHealth,
      tools: this.tools.length,
      timestamp: new Date().toISOString(),
    };
  }

  getAvailableProviders(): string[] {
    // This is a simplified implementation
    const llmConfig = getLlmConfig();
    const providers: string[] = [];
    
    if (llmConfig.providers.openai.enabled) providers.push('openai');
    if (llmConfig.providers.anthropic.enabled) providers.push('anthropic');
    if (llmConfig.providers.google.enabled) providers.push('google');
    if (llmConfig.providers.ollama.enabled) providers.push('ollama');
    
    return providers;
  }

  getAllProvidersStatus(): Record<string, any> {
    const providers = this.getAvailableProviders();
    const status: Record<string, any> = {};
    
    providers.forEach(provider => {
      status[provider] = { enabled: true, healthy: true };
    });
    
    return status;
  }

  getProviderStatus(provider: string): any {
    return { enabled: true, healthy: true };
  }
}

// Singleton instance
let mcpRouterInstance: EnhancedLLMRouter | null = null;

/**
 * Get the singleton MCP router instance
 */
export const getMCPRouter = async (): Promise<EnhancedLLMRouter> => {
  if (!mcpRouterInstance) {
    mcpRouterInstance = await EnhancedLLMRouter.create();
  }
  return mcpRouterInstance;
};

/**
 * Initialize the MCP router (called at application startup)
 */
export const initializeMCPRouter = async (): Promise<void> => {
  console.log('🚀 Initializing MCP Router with load balancing...');
  mcpRouterInstance = await EnhancedLLMRouter.create();
  console.log('✅ MCP Router initialized successfully');
};

// Export default instance getter
export default getMCPRouter;
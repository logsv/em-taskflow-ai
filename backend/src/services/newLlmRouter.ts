import { ResilientRouter, type LLMRequest, type LLMResponse, type RouterConfig, type LLMProviderConfig } from 'llm-router';
import { MCPClient, MCPAgent } from 'mcp-use';
import { config, toLlmRouterConfig, getLlmConfig } from '../config/index.js';

// MCP Agent cache for reusing agents across requests
const mcpAgentCache = new Map<string, MCPAgent>();

// Create MCP agents for load balancing
const createMCPAgents = async () => {
  const agents: Record<string, MCPAgent> = {};
  
  // Create OpenAI MCP Agent if API key is available
  const llmConfig = getLlmConfig();
  const openaiKey = llmConfig.providers.openai.apiKey;
  if (openaiKey && openaiKey.trim() !== '' && llmConfig.providers.openai.enabled) {
    try {
      const { ChatOpenAI } = await import('@langchain/openai');
      const openaiLLM = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        apiKey: openaiKey,
        temperature: 0.7
      });
      
      // Create MCP client for OpenAI agent
      const mcpClient = MCPClient.fromDict({ mcpServers: {} }); // Empty for now, will be populated
      agents['openai-agent'] = new MCPAgent({
        llm: openaiLLM as any,
        client: mcpClient,
        maxSteps: 20
      });
      
      console.log('✅ Created OpenAI MCP Agent for load balancing');
    } catch (error) {
      console.warn('⚠️ Could not create OpenAI MCP Agent:', error);
    }
  }
  
  // Create Ollama MCP Agent
  const ollamaBaseUrl = llmConfig.providers.ollama.baseUrl;
  if (ollamaBaseUrl && llmConfig.providers.ollama.enabled) {
    try {
      const { ChatOllama } = await import('@langchain/ollama');
      const ollamaLLM = new ChatOllama({
        baseUrl: ollamaBaseUrl,
        model: 'gpt-oss:latest',
        temperature: 0.7
      });
      
      // Create MCP client for Ollama agent
      const mcpClient = MCPClient.fromDict({ mcpServers: {} }); // Empty for now, will be populated
      agents['ollama-agent'] = new MCPAgent({
        llm: ollamaLLM as any,
        client: mcpClient,
        maxSteps: 20
      });
      
      console.log('✅ Created Ollama MCP Agent for load balancing');
    } catch (error) {
      console.warn('⚠️ Could not create Ollama MCP Agent:', error);
    }
  }
  
  return agents;
};

// Provider handlers using MCP agents
const createProviderHandlers = () => {
  return {
    'openai-prod-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const agent = mcpAgentCache.get('openai-agent');
      if (!agent) {
        throw new Error('OpenAI MCP Agent not available');
      }
      
      const result = await Promise.race([
        agent.run(req.messages[0]?.content || 'Complete this request', 20),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('MCP agent timed out after 40 seconds')), 40_000))
      ]);
      return {
        text: result,
        model: 'gpt-4o-mini-mcp',
        provider: 'openai-mcp',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      };
    },
    'ollama-local-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const agent = mcpAgentCache.get('ollama-agent');
      if (!agent) {
        throw new Error('Ollama MCP Agent not available');
      }
      
      const result = await Promise.race([
        agent.run(req.messages[0]?.content || 'Complete this request', 20),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('MCP agent timed out after 40 seconds')), 40_000))
      ]);
      return {
        text: result,
        model: 'llama3.1-latest-mcp',
        provider: 'ollama-mcp',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      };
    }
  };
};

// Create router config for MCP agents
const createRouterConfig = (): RouterConfig => {
  const handlers = createProviderHandlers();
  const providers: LLMProviderConfig[] = [];
  
  // Add OpenAI provider if available
  const llmConfig = getLlmConfig();
  const openaiKey = llmConfig.providers.openai.apiKey;
  if (openaiKey && openaiKey.trim() !== '' && llmConfig.providers.openai.enabled) {
    providers.push({
      name: 'openai-prod-provider',
      type: 'custom' as const,
      enabled: true,
      priority: 1,
      models: [{
        name: 'gpt-4o-mini-mcp',
        costPer1kInputTokens: 0.00015,
        costPer1kOutputTokens: 0.0006,
        maxTokens: 16384
      }],
      rateLimit: {
        maxConcurrent: 10,
        tokensPerSecond: 10000
      },
      handler: handlers['openai-prod-provider']
    });
  }
  
  // Add Ollama provider
  const ollamaBaseUrl = llmConfig.providers.ollama.baseUrl;
  if (ollamaBaseUrl && llmConfig.providers.ollama.enabled) {
    providers.push({
      name: 'ollama-local-provider',
      type: 'custom' as const,
      enabled: true,
      priority: 2, // Lower priority than OpenAI
      models: [{
         name: 'gpt-oss-latest-mcp',
        costPer1kInputTokens: 0, // Local model - no cost
        costPer1kOutputTokens: 0,
        maxTokens: 128000
      }],
      rateLimit: {
        maxConcurrent: 3, // Lower concurrency for local model
        tokensPerSecond: 2000
      },
      handler: handlers['ollama-local-provider']
    });
  }

  return {
    loadBalancingStrategy: 'round_robin',
    defaultModel: 'gpt-oss-latest-mcp',
    providers,
    resilience: {
      retry: {
        enabled: true,
        attempts: 2,
        initialBackoffMs: 500,
        maxBackoffMs: 5000,
        multiplier: 1.5
      },
      circuitBreaker: {
        enabled: true,
        threshold: 3,
        samplingDurationMs: 30000,
        resetTimeoutMs: 15000
      }
    }
  };
};

/**
 * Enhanced LLM Router using the new resilient router implementation
 * Provides backward compatibility with the existing EM TaskFlow architecture
 */
export class EnhancedLLMRouter {
  private router: ResilientRouter;
  private config: RouterConfig;

  static async create(configPath?: string): Promise<EnhancedLLMRouter> {
    // Initialize MCP agents first
    console.log('🔧 Initializing MCP agents for load balancing...');
    const agents = await createMCPAgents();
    
    // Cache the agents for use in handlers
    Object.entries(agents).forEach(([name, agent]) => {
      mcpAgentCache.set(name, agent);
    });
    
    const newConfig = createRouterConfig();
    const handlers = createProviderHandlers();
    
    const router = await ResilientRouter.create(handlers, () => newConfig);
    return new EnhancedLLMRouter(router, newConfig);
  }

  private constructor(router: ResilientRouter, config: RouterConfig) {
    this.router = router;
    this.config = config;
  }

  /**
   * Execute an LLM request with resilience patterns
   */
  async execute(request: LLMRequest, preferredProviders: string[] = []): Promise<LLMResponse> {
    return await this.router.execute(request, preferredProviders);
  }

  /**
   * Get provider status and metrics
   */
  getProviderStatus(providerName: string) {
    return this.router.getProviderStatus(providerName);
  }

  /**
   * Get all providers status
   */  
  getAllProvidersStatus() {
    return this.router.getProviderStatuses();
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return this.router.getAvailableModels();
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return this.router.getAvailableProviders();
  }

  /**
   * Health check
   */
  async healthCheck() {
    return await this.router.healthCheck();
  }

  /**
   * Get MCP agents for direct access
   */
  getMCPAgents(): Map<string, MCPAgent> {
    return mcpAgentCache;
  }

  /**
   * Execute query using best available MCP agent
   */
  async executeMCPQuery(query: string, maxSteps: number = 20): Promise<string> {
    // Try OpenAI first, then fall back to Ollama
    const openaiAgent = mcpAgentCache.get('openai-agent');
    const ollamaAgent = mcpAgentCache.get('ollama-agent');
    
    const agent = openaiAgent || ollamaAgent;
    if (!agent) {
      throw new Error('No MCP agents available');
    }
    
    return await Promise.race([
      agent.run(query, maxSteps),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('MCP agent timed out after 40 seconds')), 40_000))
    ]);
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerName: string, updates: Partial<LLMProviderConfig>) {
    // This would require recreating the router with new config
    console.log(`Provider config update requested for ${providerName}:`, updates);
    // Implementation would need to be added to the new router library
  }

  /**
   * Get configuration
   */
  getConfig(): RouterConfig {
    return this.config;
  }
}

// Create singleton instance for the application
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
import { ResilientRouter, type LLMRequest, type LLMResponse, type RouterConfig, type LLMProviderConfig } from 'llm-router';
import { OpenAIPovider, AnthropicProvider, GoogleProvider, OllamaProvider } from './llmProviders.js';
import { loadConfig } from '../config/loadConfig.js';
import config from '../config/config.js';
import type { RouterConfig as OldRouterConfig } from '../types/config.js';

// Provider handlers for different LLM providers
const createProviderHandlers = () => {
  return {
    'openai-prod-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new OpenAIPovider(config.get('llm.openai.apiKey'));
      return await provider.createCompletion(req);
    },
    'anthropic-prod-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new AnthropicProvider(config.get('llm.anthropic.apiKey'));
      return await provider.createCompletion(req);
    },
    'google-prod-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new GoogleProvider(config.get('llm.google.apiKey'));
      return await provider.createCompletion(req);
    },
    'ollama-local-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new OllamaProvider(config.get('llm.ollama.baseUrl'));
      return await provider.createCompletion(req);
    }
  };
};

// Convert old config format to new router config format
const convertConfig = (oldConfig: OldRouterConfig): RouterConfig => {
  const handlers = createProviderHandlers();
  const newProviders: LLMProviderConfig[] = oldConfig.providers.map(provider => ({
    name: `${provider.name}-provider`,
    type: 'custom' as const, // Always use custom type since we provide handlers
    enabled: provider.enabled ?? false, // Default to false to respect original configuration
    priority: provider.priority ?? 1,
    models: provider.models || [{
      name: 'default-model',
      costPer1kInputTokens: 0.001,
      costPer1kOutputTokens: 0.002,
      maxTokens: 4096
    }],
    rateLimit: {
      maxConcurrent: provider.rateLimit?.maxConcurrent || 5,
      tokensPerSecond: provider.rateLimit?.tokensPerSecond || 1000 // Much higher for local LLMs
    },
    handler: handlers[`${provider.name}-provider` as keyof typeof handlers]
  }));

  return {
    loadBalancingStrategy: oldConfig.loadBalancingStrategy || 'round_robin',
    defaultModel: oldConfig.defaultModel || 'mistral:latest',
    providers: newProviders,
    resilience: {
      retry: {
        enabled: true,
        attempts: 2, // Reduce retry attempts for faster failure
        initialBackoffMs: 500,
        maxBackoffMs: 5000,
        multiplier: 1.5
      },
      circuitBreaker: {
        enabled: true,
        threshold: 3, // Lower threshold for faster circuit breaking
        samplingDurationMs: 30000, // Shorter sampling window
        resetTimeoutMs: 15000 // Shorter reset timeout
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
    const oldConfig = await loadConfig(configPath);
    const newConfig = convertConfig(oldConfig);
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

export default EnhancedLLMRouter;
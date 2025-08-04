import { ResilientRouter, type LLMRequest, type LLMResponse, type RouterConfig, type LLMProviderConfig } from 'llm-router';
import { OpenAIPovider, AnthropicProvider, GoogleProvider, OllamaProvider } from './llmProviders.js';
import { loadConfig } from '../config/loadConfig.js';
import type { RouterConfig as OldRouterConfig } from '../types/config.js';

// Provider handlers for different LLM providers
const createProviderHandlers = () => {
  return {
    'openai-prod-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new OpenAIPovider(process.env.OPENAI_API_KEY || '');
      return await provider.createCompletion(req);
    },
    'anthropic-prod-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');
      return await provider.createCompletion(req);
    },
    'google-prod-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new GoogleProvider(process.env.GOOGLE_API_KEY || '');
      return await provider.createCompletion(req);
    },
    'ollama-local-provider': async (req: LLMRequest): Promise<LLMResponse> => {
      const provider = new OllamaProvider(process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
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
      maxConcurrent: provider.rateLimit?.maxConcurrent || 10,
      tokensPerSecond: provider.rateLimit?.tokensPerSecond || 10
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
        attempts: 3,
        initialBackoffMs: 100,
        maxBackoffMs: 1000,
        multiplier: 2
      },
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        samplingDurationMs: 60000,
        resetTimeoutMs: 30000
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
    // Since providers property is protected, we'll need to implement this differently
    // For now, return basic status
    return {
      name: providerName,
      enabled: true,
      circuitBreakerState: 'closed',
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitedRequests: 0,
        circuitBreakerTrips: 0,
        lastRequestTime: 0,
        averageResponseTime: 0
      },
      lastUsed: 0
    };
  }

  /**
   * Get all providers status
   */
  getAllProvidersStatus() {
    // Since providers property is protected, return configured providers
    const configuredProviders = this.config.providers.map(p => ({
      name: p.name.replace('-provider', ''),
      enabled: p.enabled ?? true,
      circuitBreakerState: 'closed',
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitedRequests: 0,
        circuitBreakerTrips: 0,
        lastRequestTime: 0,
        averageResponseTime: 0
      },
      lastUsed: 0
    }));
    return configuredProviders;
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
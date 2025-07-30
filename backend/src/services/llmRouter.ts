import type { LLMProvider } from './llmProviders.js';
import { createProvider } from './llmProviders.js';
import Bottleneck from 'bottleneck';
import { type IPolicy, retry, handleAll, circuitBreaker, ConsecutiveBreaker, type IRetryBackoffContext, ExponentialBackoff } from 'cockatiel';
import { loadConfig } from '../config/loadConfig.js';
import { DEFAULT_CIRCUIT_BREAKER, DEFAULT_RETRY, type RouterConfig, type LoadedProviderConfig, type LLMProviderConfig, type CircuitBreakerConfig, type RetryConfig } from '../types/config.js';

// Define LLM request and response interfaces
export interface LLMRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  [key: string]: unknown;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

interface ProviderWrapper {
  provider: LLMProvider;
  config: LoadedProviderConfig;
  limiter: Bottleneck;
  circuitBreaker: IPolicy;
  retryPolicy: IPolicy;
  lastUsed: number;
  failureCount: number;
  successCount: number;
}

export class LLMRouter {
  private providers: Map<string, ProviderWrapper>;
  private circuitBreakers: Map<string, IPolicy>;
  private strategy: 'round_robin' | 'cost_priority_round_robin';
  private config: RouterConfig;
  private defaultModel: string;

  /**
   * Create a new LLM router instance
   * @param config Optional configuration to use. If not provided, will load from default location
   */
  static async create(configPath?: string): Promise<LLMRouter> {
    const config = await loadConfig(configPath);
    const router = new LLMRouter(config);
    await router.initializeProviders(config);
    return router;
  }

  private constructor(config: RouterConfig) {
    this.providers = new Map();
    this.circuitBreakers = new Map();
    this.strategy = config.loadBalancingStrategy || 'round_robin';
    this.defaultModel = config.defaultModel || '';
    this.config = config;
  }

  private async initializeProviders(config: RouterConfig) {
    if (!config.providers || config.providers.length === 0) {
      throw new Error('No LLM providers configured');
    }

    // Initialize each provider
    for (const providerConfig of config.providers) {
      if (!providerConfig.enabled) continue;

      // Ensure required fields are present
      if (!providerConfig.name || !providerConfig.type) {
        console.warn(`Skipping provider with missing name or type`);
        continue;
      }

      // Create rate limiter
      const limiter = new Bottleneck({
        maxConcurrent: providerConfig.rateLimit?.maxConcurrent || 10,
        minTime: providerConfig.rateLimit?.minTimeMs ? 
          1000 / (providerConfig.rateLimit.tokensPerSecond || 1) : 100,
      });

      // Create circuit breaker with defaults
      const circuitBreakerConfig: Required<CircuitBreakerConfig> = {
          failureThreshold: providerConfig.circuitBreaker?.failureThreshold ?? DEFAULT_CIRCUIT_BREAKER.failureThreshold,
          successThreshold: providerConfig.circuitBreaker?.successThreshold ?? DEFAULT_CIRCUIT_BREAKER.successThreshold,
          timeout: (providerConfig.circuitBreaker?.timeout ?? DEFAULT_CIRCUIT_BREAKER.timeout) * 1000,
        };

        const retryConfig: Required<RetryConfig> = {
          maxAttempts: providerConfig.retry?.maxAttempts ?? DEFAULT_RETRY.maxAttempts,
          initialDelay: providerConfig.retry?.initialDelay ?? DEFAULT_RETRY.initialDelay,
          maxDelay: providerConfig.retry?.maxDelay ?? DEFAULT_RETRY.maxDelay,
          factor: providerConfig.retry?.factor ?? DEFAULT_RETRY.factor,
        };

      const breaker = circuitBreaker(
        handleAll,
        {
          halfOpenAfter: circuitBreakerConfig.timeout,
          breaker: new ConsecutiveBreaker(circuitBreakerConfig.failureThreshold),
        }
      );

      const retryPolicy = this.createRetryPolicy(retryConfig);

      try {
        // Create provider instance with required fields
        const provider = createProvider({
          name: providerConfig.name,
          type: providerConfig.type,
          apiKey: providerConfig.apiKey || '',
          baseUrl: providerConfig.baseUrl || '',
        });

        // Store provider with its configuration


        // Store provider with its configuration
        const loadedProviderConfig: LoadedProviderConfig = {
          name: providerConfig.name!,
          type: providerConfig.type!,
          enabled: providerConfig.enabled ?? true,
          priority: providerConfig.priority ?? 1,
          apiKey: providerConfig.apiKey || '',
          baseUrl: providerConfig.baseUrl || '',
          models: providerConfig.models ?? [],
          circuitBreaker: circuitBreakerConfig,
          retry: retryConfig,
        };
        // Copy any other properties from providerConfig that are not explicitly handled
        Object.keys(providerConfig).forEach(key => {
            if (!(key in loadedProviderConfig)) {
                (loadedProviderConfig as any)[key] = (providerConfig as any)[key];
            }
        });

        this.providers.set(providerConfig.name, {
          provider,
          config: loadedProviderConfig,
          limiter,
          circuitBreaker: breaker,
          retryPolicy,
          lastUsed: 0,
          failureCount: 0,
          successCount: 0,
        });
        
        console.log(`Initialized provider: ${providerConfig.name} (${providerConfig.type})`);
      } catch (error) {
        console.error(`Failed to initialize provider ${providerConfig.name}:`, error);
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No LLM providers could be initialized');
    }
  }

  private createRetryPolicy(config: Required<RetryConfig>): IPolicy {
    return retry(handleAll, {
      maxAttempts: config.maxAttempts,
      backoff: new ExponentialBackoff({
        initialDelay: config.initialDelay,
        maxDelay: config.maxDelay,
        exponent: config.factor,
      }),
    });
  }

  private getProviderWeights(): Array<{ name: string; weight: number }> {
    const weights: Array<{ name: string; weight: number }> = [];
    
    for (const [name, provider] of this.providers.entries()) {
      if (!provider.config.enabled) continue;
      
      if (this.strategy === 'round_robin') {
        weights.push({ name, weight: 1 });
      } else {
        // cost_priority_round_robin strategy
        const model = provider.config.models[0];
        if (!model) continue;
        
        const cost = model.costPer1kInputTokens * 0.5 + model.costPer1kOutputTokens * 0.5;
        const weight = 1 / (cost * provider.config.priority);
        weights.push({ name, weight });
      }
    }
    
    return weights;
  }

  private getProvider(name: string): ProviderWrapper | null {
    const provider = this.providers.get(name);
    if (!provider || !provider.config.enabled) return null;
    return provider;
  }

  private async executeWithRetry(providerName: string, request: LLMRequest): Promise<LLMResponse> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    // Update last used timestamp
    provider.lastUsed = Date.now();

    // Execute with retry, circuit breaker, and rate limiting
    const executeFn = async (): Promise<LLMResponse> => {
      return await provider.limiter.schedule(async () => {
        if (!provider) throw new Error('Provider not available');
        return await provider.provider.createCompletion(request);
      });
    };

    return await provider.retryPolicy.execute(() => 
      provider.circuitBreaker.execute(() => executeFn())
    );
  }

  /**
   * Get a list of provider names that support the specified model
   */
  private getProvidersForModel(model: string): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, wrapper]) => 
        wrapper.config.enabled &&
        wrapper.config.models.some(m => m.name === model)
      )
      .map(([name]) => name);
  }

  /**
   * Select the most appropriate provider based on the current strategy
   */
  private selectProvider(providers: string[]): string | null {
    if (providers.length === 0) return null;
    
    // Get all available and enabled providers that match the filter
    const availableProviders = Array.from(this.providers.entries())
      .filter(([name, wrapper]) => 
        providers.includes(name) && 
        wrapper.config.enabled
      );
      
    if (availableProviders.length === 0) return null;

    // Get current timestamp for health calculations
    const now = Date.now();
    const oneMinute = 60000;
    
    // Filter out unhealthy providers (too many recent failures)
    const healthyProviders = availableProviders.filter(([_, wrapper]) => {
      // If we have failures, check the cooldown period
      if (wrapper.failureCount > 0) {
        const timeSinceLastFailure = now - (wrapper.lastUsed || 0);
        return timeSinceLastFailure > oneMinute * Math.min(wrapper.failureCount, 5);
      }
      return true;
    });
    
    // Use healthy providers if available, otherwise fall back to all available
    const candidates = healthyProviders.length > 0 ? healthyProviders : availableProviders;
    
    // Apply load balancing strategy
    if (this.strategy === 'cost_priority_round_robin') {
      return this.selectByCostPriority(candidates);
    }
    
    // Default to round-robin selection
    return this.selectRoundRobin(candidates);
  }
  
  /**
   * Select provider using round-robin strategy
   */
  private selectRoundRobin(providers: [string, ProviderWrapper][]): string {
    return providers.reduce((a, b) => 
      (a[1].lastUsed || 0) < (b[1].lastUsed || 0) ? a : b
    )[0];
  }
  
  /**
   * Select provider based on cost and priority
   */
  private selectByCostPriority(providers: [string, ProviderWrapper][]): string {
    // Calculate weights based on cost and priority
    const weightedProviders = providers.map(([name, wrapper]) => {
      const model = wrapper.config.models[0]; // For simplicity, use first model
      const costWeight = 1 / (model?.costPer1kInputTokens || 0.01);
      const priorityWeight = wrapper.config.priority || 1;
      const weight = costWeight * priorityWeight;
      
      // Adjust weight based on last used time (prefer less recently used)
      const timeSinceLastUse = Date.now() - (wrapper.lastUsed || 0);
      const timeWeight = Math.min(timeSinceLastUse / 60000, 10); // Cap at 10x weight
      
      return {
        name,
        weight: weight * timeWeight,
        lastUsed: wrapper.lastUsed || 0,
      };
    });
    
    // Select provider using weighted random selection
    const totalWeight = weightedProviders.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const provider of weightedProviders) {
      if (random < provider.weight) {
        return provider.name;
      }
      random -= provider.weight;
    }
    
    // Fallback to least recently used if something went wrong
    return weightedProviders.reduce((a, b) => 
      a.lastUsed < b.lastUsed ? a : b
    ).name;
  }

  public async execute(request: LLMRequest, preferredProviders: string[] = []): Promise<LLMResponse> {
    // Ensure we have a model specified
    const model = request.model || this.defaultModel;
    if (!model) {
      throw new Error('No model specified in request and no default model configured');
    }

    // Get providers that support the requested model
    const availableProviders = this.getProvidersForModel(model);
    if (availableProviders.length === 0) {
      throw new Error(`No providers available for model: ${model}`);
    }

    // First try preferred providers that support the model
    let providerName = this.selectProvider(
      preferredProviders.filter(p => availableProviders.includes(p))
    );
    
    // If no preferred providers are available, try any available provider
    if (!providerName) {
      providerName = this.selectProvider(availableProviders);
    }
    
    if (!providerName) {
      throw new Error('No available LLM providers');
    }
    
    try {
      const response = await this.executeWithRetry(providerName, { ...request, model });
      
      // Update provider stats on success
      const wrapper = this.providers.get(providerName);
      if (wrapper) {
        wrapper.lastUsed = Date.now();
        wrapper.successCount = (wrapper.successCount || 0) + 1;
        wrapper.failureCount = Math.max(0, (wrapper.failureCount || 0) - 1);
      }
      
      return response;
    } catch (error) {
      console.error(`Failed to execute with ${providerName}:`, error);
      
      // Update provider stats on failure
      const wrapper = this.providers.get(providerName);
      if (wrapper) {
        wrapper.failureCount = (wrapper.failureCount || 0) + 1;
      }
      
      // If we have other providers that support the model, try them
      const otherProviders = availableProviders.filter(
        p => p !== providerName && 
             (preferredProviders.length === 0 || preferredProviders.includes(p))
      );
      
      if (otherProviders.length > 0) {
        console.log(`Trying fallback providers: ${otherProviders.join(', ')}`);
        return this.execute({ ...request, model }, otherProviders);
      }
      
      throw error;
    }
  }

  public updateProviderConfig(providerName: string, updates: Partial<LLMProviderConfig>) {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Provider ${providerName} not found`);

    const newConfig: LoadedProviderConfig = { ...provider.config };

    // Handle circuitBreaker updates
    if (updates.circuitBreaker !== undefined) {
      newConfig.circuitBreaker = {
        ...provider.config.circuitBreaker,
        ...updates.circuitBreaker,
      };
    }

    // Handle retry updates
    if (updates.retry !== undefined) {
      newConfig.retry = {
        ...provider.config.retry,
        ...updates.retry,
      };
    }

    // Copy other properties, excluding circuitBreaker and retry which are handled above
    for (const key in updates) {
      if (key !== 'circuitBreaker' && key !== 'retry') {
        (newConfig as any)[key] = (updates as any)[key];
      }
    }

    provider.config = newConfig;
    
    // Reinitialize rate limiter if rate limits changed
    if (updates.models?.[0]?.rateLimit) {
      provider.limiter.updateSettings({
        minTime: 1000 / (updates.models[0].rateLimit.requestsPerMinute / 60),
        reservoir: updates.models[0].rateLimit.tokensPerMinute,
        reservoirRefreshAmount: updates.models[0].rateLimit.tokensPerMinute,
      });
    }
  }

  public getProviderStatus(providerName: string) {
    const provider = this.providers.get(providerName);
    if (!provider) return null;
    
    // Get circuit breaker state safely
    const circuitBreakerState = this.circuitBreakers.get(providerName);
    const isOpen = circuitBreakerState ? 
      (circuitBreakerState as any).state === 'OPEN' : 
      false;
    const state = circuitBreakerState ? 
      (circuitBreakerState as any).state : 
      'UNKNOWN';

    return {
      name: provider.config.name,
      type: provider.config.type,
      enabled: provider.config.enabled,
      lastUsed: provider.lastUsed,
      failureCount: provider.failureCount,
      successCount: provider.successCount,
      circuitBreaker: {
        isOpen,
        state,
      },
      rateLimiter: {
        queueLength: provider.limiter.queued(),
        running: provider.limiter.running(),
        done: provider.limiter.done(),
      },
    };
  }
}

// Example usage:
/*
const router = new LLMRouter([
  {
    name: 'openai',
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    models: [{
      name: 'gpt-4',
      costPer1kInputTokens: 0.03,
      costPer1kOutputTokens: 0.06,
      maxTokens: 8192,
      rateLimit: {
        tokensPerMinute: 40000,
        requestsPerMinute: 200,
      },
    }],
    priority: 1,
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
    },
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2,
    },
    enabled: true,
  },
  // Add other providers...
], 'cost_priority_round_robin');

// Make a request
const response = await router.routeRequest({
  prompt: 'Hello, world!',
  model: 'gpt-4',
  maxTokens: 100,
  temperature: 0.7,
});
*/

export default LLMRouter;

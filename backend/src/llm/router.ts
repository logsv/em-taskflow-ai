/**
 * LLM Router Layer - Cost/round-robin + circuit breaker patterns
 * Layer above agent for multiple provider support using llm-router NPM package
 */

import { LLMRouter, createProvider, type RouterConfig } from 'llm-router';
import { config, getLlmConfig } from '../config.js';
import { getChatOllama } from './index.js';

// Singleton router instance
let llmRouter: LLMRouter | null = null;
let initialized = false;

/**
 * Initialize LLM Router with multiple providers
 */
export async function initializeLLMRouter(): Promise<void> {
  if (initialized) return;

  console.log('🔀 Initializing LLM Router with multiple providers...');

  try {
    const llmConfig = getLlmConfig();

    // Create router configuration
    const routerConfig: RouterConfig = {
      loadBalancingStrategy: llmConfig.loadBalancingStrategy || 'cost_priority_round_robin',
      defaultModel: llmConfig.defaultModel || 'gpt-oss:latest',
      providers: []
    };

    // Add OpenAI provider if enabled
    if (llmConfig.providers.openai.enabled && llmConfig.providers.openai.apiKey) {
      routerConfig.providers.push({
        name: 'openai',
        type: 'openai',
        enabled: true,
        priority: llmConfig.providers.openai.priority || 1,
        apiKey: llmConfig.providers.openai.apiKey,
        baseUrl: llmConfig.providers.openai.baseUrl,
        models: [
          {
            name: 'gpt-4o-mini',
            costPer1kInputTokens: 0.00015,
            costPer1kOutputTokens: 0.0006,
            maxTokens: 16384
          },
          {
            name: 'gpt-4o',
            costPer1kInputTokens: 0.005,
            costPer1kOutputTokens: 0.015,
            maxTokens: 4096
          },
          {
            name: 'gpt-3.5-turbo',
            costPer1kInputTokens: 0.001,
            costPer1kOutputTokens: 0.002,
            maxTokens: 4096
          }
        ]
      });
    }

    // Add Anthropic provider if enabled
    if (llmConfig.providers.anthropic.enabled && llmConfig.providers.anthropic.apiKey) {
      routerConfig.providers.push({
        name: 'anthropic',
        type: 'anthropic',
        enabled: true,
        priority: llmConfig.providers.anthropic.priority || 2,
        apiKey: llmConfig.providers.anthropic.apiKey,
        baseUrl: llmConfig.providers.anthropic.baseUrl,
        models: [
          {
            name: 'claude-3-5-sonnet-20241022',
            costPer1kInputTokens: 0.003,
            costPer1kOutputTokens: 0.015,
            maxTokens: 8192
          },
          {
            name: 'claude-3-5-haiku-20241022',
            costPer1kInputTokens: 0.0008,
            costPer1kOutputTokens: 0.004,
            maxTokens: 8192
          }
        ]
      });
    }

    // Add Ollama as fallback (always available)
    routerConfig.providers.push({
      name: 'ollama',
      type: 'ollama',
      enabled: true,
      priority: llmConfig.providers.ollama.priority || 4,
      baseUrl: llmConfig.providers.ollama.baseUrl,
      models: [
        {
          name: 'gpt-oss:latest',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 8192
        },
        {
          name: 'gpt-oss:20b',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 8192
        },
        {
          name: 'llama3:latest',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 8192
        }
      ]
    });

    // Create router instance
    llmRouter = await LLMRouter.create(undefined, () => routerConfig);

    initialized = true;
    console.log(`✅ LLM Router initialized with ${routerConfig.providers.length} providers`);
    console.log(`📊 Strategy: ${routerConfig.loadBalancingStrategy}, Default: ${routerConfig.defaultModel}`);

  } catch (error) {
    console.error('❌ Failed to initialize LLM Router:', error);
    throw error;
  }
}

/**
 * Get LLM Router instance
 */
export function getLLMRouter(): LLMRouter {
  if (!llmRouter) {
    throw new Error('LLM Router not initialized. Call initializeLLMRouter() first.');
  }
  return llmRouter;
}

/**
 * Chat completion using router (with fallbacks and circuit breaking)
 */
export async function routedChatCompletion(messages: any[], options: {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
} = {}): Promise<any> {
  await ensureRouterReady();

  try {
    const router = getLLMRouter();
    
    // Convert messages to prompt for the router
    const prompt = messages.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n');
    
    const result = await router.execute({
      prompt,
      model: options.model || 'gpt-oss:latest',
      temperature: options.temperature ?? 0.1,
      maxTokens: options.maxTokens || 4096,
    });

    // Convert back to OpenAI-compatible format
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: result.text
        }
      }],
      usage: result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      provider: result.provider,
      model: result.model
    };

  } catch (error) {
    console.error('❌ Routed chat completion failed:', error);
    
    // Fallback to direct Ollama if router fails
    console.warn('⚠️ Falling back to direct Ollama...');
    try {
      const ollamaLLM = getChatOllama();
      const prompt = messages.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n');
      const result = await ollamaLLM.invoke(prompt);
      return {
        choices: [{
          message: {
            role: 'assistant',
            content: typeof result.content === 'string' ? result.content : String(result.content)
          }
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        provider: 'ollama-fallback'
      };
    } catch (fallbackError) {
      console.error('❌ Ollama fallback failed:', fallbackError);
      throw error; // Throw original router error
    }
  }
}

/**
 * Get router status and metrics
 */
export async function getRouterStatus(): Promise<{
  initialized: boolean;
  providers: any[];
  activeProviders: number;
  metrics?: any;
  strategy: string;
}> {
  if (!initialized || !llmRouter) {
    return {
      initialized: false,
      providers: [],
      activeProviders: 0,
      strategy: 'none',
    };
  }

  try {
    const router = getLLMRouter();
    const providerStatuses = router.getProviderStatuses();
    const availableProviders = router.getAvailableProviders();
    const config = router.getConfig();

    return {
      initialized: true,
      providers: Object.values(providerStatuses),
      activeProviders: availableProviders.length,
      metrics: providerStatuses,
      strategy: config.loadBalancingStrategy || 'cost_priority_round_robin',
    };

  } catch (error) {
    console.error('❌ Failed to get router status:', error);
    return {
      initialized: true,
      providers: [],
      activeProviders: 0,
      strategy: 'error',
    };
  }
}

/**
 * Test router with a simple completion
 */
export async function testRouter(prompt = 'Hello, world!'): Promise<{
  success: boolean;
  response?: string;
  provider?: string;
  responseTime?: number;
  error?: string;
}> {
  try {
    await ensureRouterReady();
    
    const startTime = Date.now();
    const router = getLLMRouter();
    const result = await router.execute({
      prompt,
      model: 'gpt-oss:latest'
    });
    const responseTime = Date.now() - startTime;

    return {
      success: true,
      response: result.text || 'No response',
      provider: result.provider || 'unknown',
      responseTime,
    };

  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Ensure router is initialized
 */
async function ensureRouterReady(): Promise<void> {
  if (!initialized) {
    await initializeLLMRouter();
  }
}

/**
 * Check if router is initialized
 */
export function isRouterInitialized(): boolean {
  return initialized;
}
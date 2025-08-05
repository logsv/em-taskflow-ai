import { EnhancedLLMRouter } from './newLlmRouter.js';
import type { LLMRequest, LLMResponse, RouterConfig } from 'llm-router';

// Enhanced LLM service that uses the sophisticated LLM router
class EnhancedLLMService {
  private router: EnhancedLLMRouter | null = null;
  private initialized = false;

  /**
   * Initialize the enhanced LLM service with router
   */
  async initialize(configPath?: string): Promise<void> {
    try {
      console.log('🚀 Initializing Enhanced LLM Service with router...');
      this.router = await EnhancedLLMRouter.create(configPath);
      this.initialized = true;
      console.log('✅ Enhanced LLM Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced LLM Service:', error);
      throw error;
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.router !== null;
  }

  /**
   * Complete text using the LLM router with advanced features
   */
  async complete(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      stop?: string | string[];
      preferredProviders?: string[];
    } = {}
  ): Promise<string> {
    if (!this.isInitialized()) {
      throw new Error('Enhanced LLM Service not initialized. Call initialize() first.');
    }

    const request: LLMRequest = {
      prompt,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      stop: options.stop
    };

    try {
      const response = await this.router!.execute(request, options.preferredProviders);
      return response.text;
    } catch (error) {
      console.error('Enhanced LLM Service completion error:', error);
      throw error;
    }
  }

  /**
   * Get detailed completion response with metadata
   */
  async completeWithMetadata(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      stop?: string | string[];
      preferredProviders?: string[];
    } = {}
  ): Promise<LLMResponse> {
    if (!this.isInitialized()) {
      throw new Error('Enhanced LLM Service not initialized. Call initialize() first.');
    }

    const request: LLMRequest = {
      prompt,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      stop: options.stop
    };

    try {
      return await this.router!.execute(request, options.preferredProviders);
    } catch (error) {
      console.error('Enhanced LLM Service completion error:', error);
      throw error;
    }
  }

  /**
   * Get available models from all providers
   */
  getAvailableModels(): string[] {
    if (!this.isInitialized()) {
      return [];
    }

    // This would need to be implemented in the router
    // For now, return common models
    return [
      'gpt-3.5-turbo',
      'gpt-4',
      'gpt-4-turbo',
      'claude-3-opus-20240229',
      'claude-2',
      'gemini-pro',
      'llama2',
      'llama3'
    ];
  }

  /**
   * Get provider status information
   */
  getProviderStatus(providerName?: string): any {
    if (!this.isInitialized()) {
      return null;
    }

    if (providerName) {
      return this.router!.getProviderStatus(providerName);
    }

    // Return status for all providers
    const allProviders = this.getAvailableProviders();
    const statusMap: Record<string, any> = {};
    
    for (const provider of allProviders) {
      statusMap[provider] = this.router!.getProviderStatus(provider);
    }
    
    return statusMap;
  }

  /**
   * Get list of available provider names
   */
  getAvailableProviders(): string[] {
    if (!this.isInitialized()) {
      return [];
    }

    return this.router!.getAvailableProviders();
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerName: string, updates: any): void {
    if (!this.isInitialized()) {
      throw new Error('Enhanced LLM Service not initialized. Call initialize() first.');
    }

    this.router!.updateProviderConfig(providerName, updates);
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    providers: Record<string, any>;
    message: string;
  }> {
    if (!this.isInitialized()) {
      return {
        status: 'unhealthy',
        providers: {},
        message: 'Enhanced LLM Service not initialized'
      };
    }

    try {
      const result = await this.router!.healthCheck();
      return {
        status: result.status as 'healthy' | 'unhealthy',
        providers: result.providers,
        message: result.message
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        providers: this.router!.getAllProvidersStatus(),
        message: `Health check failed: ${(error as Error).message}`
      };
    }
  }
}

// Create singleton instance
const enhancedLlmService = new EnhancedLLMService();

// Export both the instance and the class
export default enhancedLlmService;
export { EnhancedLLMService };

// Backward compatibility exports
export const complete = async (prompt: string, options: any = {}) => {
  if (!enhancedLlmService.isInitialized()) {
    // Fallback to basic initialization if not initialized
    await enhancedLlmService.initialize();
  }
  return enhancedLlmService.complete(prompt, options);
};

export const getAvailableModels = () => {
  return enhancedLlmService.getAvailableModels();
};

// Export for testing purposes
export const __test__ = {
  service: enhancedLlmService,
  EnhancedLLMService
};
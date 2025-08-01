import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';
import type { RouterConfig, LLMProviderConfig, ModelConfig } from '../types/config.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Loads and validates configuration from YAML file and environment variables
 */
export async function loadConfig(configPath?: string): Promise<RouterConfig> {
  // Default config path if not provided
  const configFile = configPath || path.join(process.cwd(), 'config', 'llm-router.yaml');
  
  // Load YAML config
  const yamlConfig = await loadYamlConfig(configFile);
  
  // Merge with environment variables
  const config = mergeWithEnvVars(yamlConfig);
  
  // Validate the final configuration
  return validateConfig(config);
}

/**
 * Loads and parses YAML configuration file
 */
async function loadYamlConfig(filePath: string): Promise<Partial<RouterConfig>> {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return yaml.load(fileContents) as Partial<RouterConfig>;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`Configuration file not found at ${filePath}, using default configuration`);
      return {};
    }
    throw new Error(`Failed to load configuration file: ${(error as Error).message}`);
  }
}

/**
 * Merges YAML configuration with environment variables
 */
function mergeWithEnvVars(config: Partial<RouterConfig>): RouterConfig {
  // Default configuration
  const defaultConfig: RouterConfig = {
    loadBalancingStrategy: 'round_robin',
    defaultModel: 'gpt-3.5-turbo',
    providers: [],
  };

  // Merge with YAML config
  const mergedConfig: RouterConfig = { ...defaultConfig, ...config };

  // Process each provider to merge with env vars
  mergedConfig.providers = mergedConfig.providers.map((provider: LLMProviderConfig) => {
    const envPrefix = `LLM_${provider.name.toUpperCase()}_`;
    
    const circuitBreakerConfig = {
      failureThreshold: Number(process.env[`${envPrefix}CB_FAILURE_THRESHOLD`] || provider.circuitBreaker?.failureThreshold || 5),
      successThreshold: Number(process.env[`${envPrefix}CB_SUCCESS_THRESHOLD`] || provider.circuitBreaker?.successThreshold || 3),
      timeout: Number(process.env[`${envPrefix}CB_TIMEOUT_MS`] || provider.circuitBreaker?.timeout || 60000),
    };

    const retryConfig = {
      maxAttempts: Number(process.env[`${envPrefix}RETRY_ATTEMPTS`] || provider.retry?.maxAttempts || 3),
      initialDelay: Number(process.env[`${envPrefix}RETRY_DELAY_MS`] || provider.retry?.initialDelay || 1000),
      maxDelay: Number(process.env[`${envPrefix}RETRY_MAX_DELAY_MS`] || provider.retry?.maxDelay || 30000),
      factor: Number(process.env[`${envPrefix}RETRY_FACTOR`] || provider.retry?.factor || 2),
    };

    return {
      ...provider,
      apiKey: process.env[`${envPrefix}API_KEY`] || provider.apiKey,
      baseUrl: process.env[`${envPrefix}BASE_URL`] || provider.baseUrl,
      enabled: getEnvBoolean(`${envPrefix}ENABLED`, provider.enabled),
      priority: Number(process.env[`${envPrefix}PRIORITY`] || provider.priority),
      models: provider.models?.map((model: ModelConfig) => ({
        ...model,
        costPer1kInputTokens: Number(process.env[`${envPrefix}${model.name.toUpperCase()}_COST_INPUT`] || model.costPer1kInputTokens),
        costPer1kOutputTokens: Number(process.env[`${envPrefix}${model.name.toUpperCase()}_COST_OUTPUT`] || model.costPer1kOutputTokens),
      })),
      circuitBreaker: circuitBreakerConfig,
      retry: retryConfig,
    } as LLMProviderConfig; // Cast to LLMProviderConfig to satisfy the type checker
  });

  return mergedConfig;
}

/**
 * Validates the configuration and sets default values
 */
function validateConfig(config: RouterConfig): RouterConfig {
  // Ensure we have at least one provider
  if (!config.providers || config.providers.length === 0) {
    throw new Error('No LLM providers configured');
  }

  // Ensure default model exists in one of the providers
  if (config.defaultModel) {
    const modelExists = config.providers.some((provider: LLMProviderConfig) => 
      provider.models?.some((model: ModelConfig) => model.name === config.defaultModel)
    );
    
    if (!modelExists) {
      console.warn(`Default model ${config.defaultModel} not found in any provider`);
    }
  }

  // Ensure all providers have required fields
  config.providers.forEach((provider: LLMProviderConfig) => {
    if (!provider.name) {
      throw new Error('Provider name is required');
    }
    
    if (provider.type === 'openai' || provider.type === 'anthropic' || provider.type === 'google') {
      if (provider.enabled && !provider.apiKey && !process.env[`LLM_${provider.name.toUpperCase()}_API_KEY`]) {
        console.warn(`API key not found for enabled provider ${provider.name}, disabling it`);
        provider.enabled = false;
      }
    }
    
    // Set default values for optional fields
    if (!provider.models || provider.models.length === 0) {
      provider.models = [{
        name: 'default',
        costPer1kInputTokens: 0.01,
        costPer1kOutputTokens: 0.03,
        maxTokens: 4096,
      }];
    }
  });

  return config;
}

/**
 * Helper function to parse boolean environment variables
 */
function getEnvBoolean(key: string, defaultValue: boolean | undefined): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue ?? false;
  return value.toLowerCase() === 'true' || value === '1';
}

// Export types
export * from '../types/config.js';

// Export default config loader
export default loadConfig;

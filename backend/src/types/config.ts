/**
 * Supported LLM provider types
 */
export type LLMProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'huggingface' | 'custom';

/**
 * Model configuration
 */
export interface ModelConfig {
  name: string;
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
  maxTokens: number;
  [key: string]: any; // Allow additional model-specific properties
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold?: number; // Number of failures before opening the circuit
  successThreshold?: number; // Number of successful attempts to close the circuit
  timeout?: number; // Time in ms to wait before attempting to close the circuit
}

/**
 * Retry policy configuration
 */
export interface RetryConfig {
  maxAttempts?: number; // Maximum number of retry attempts
  initialDelay?: number; // Initial delay in ms
  maxDelay?: number; // Maximum delay in ms
  factor?: number; // Exponential backoff factor
}

/**
 * LLM Provider configuration
 */
export interface LLMProviderConfig {
  name: string;
  type: LLMProviderType;
  enabled?: boolean;
  priority?: number;
  apiKey?: string;
  baseUrl?: string;
  models?: ModelConfig[];
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  [key: string]: any; // Allow additional provider-specific properties
}

/**
 * Router configuration
 */
export interface RouterConfig {
  loadBalancingStrategy?: 'round_robin' | 'cost_priority_round_robin';
  defaultModel?: string;
  providers: LLMProviderConfig[];
  [key: string]: any; // Allow additional router-specific properties
}

/**
 * Loaded provider configuration with runtime values
 */
export interface LoadedProviderConfig {
  name: string;
  type: LLMProviderType;
  enabled: boolean;
  priority: number;
  apiKey?: string;
  baseUrl?: string;
  models: ModelConfig[];
  circuitBreaker: Required<CircuitBreakerConfig>;
  retry: Required<RetryConfig>;
  [key: string]: any; // Allow additional provider-specific properties
}

/**
 * Loaded router configuration with runtime values
 */
export interface LoadedRouterConfig extends Omit<RouterConfig, 'providers'> {
  providers: LoadedProviderConfig[];
}

// Default values
export const DEFAULT_CIRCUIT_BREAKER: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000, // 1 minute
};

export const DEFAULT_RETRY: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  factor: 2,
};

export const DEFAULT_MODEL: ModelConfig = {
  name: 'default',
  costPer1kInputTokens: 0.01,
  costPer1kOutputTokens: 0.03,
  maxTokens: 4096,
};

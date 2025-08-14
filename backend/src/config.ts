import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment Variables Schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().ip().default('127.0.0.1'),
  
  // Database
  DATABASE_PATH: z.string().default('./data/taskflow.db'),
  
  // ChromaDB
  CHROMA_HOST: z.string().default('localhost'),
  CHROMA_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  
  // RAG
  RAG_ENABLED: z.coerce.boolean().default(true),
  RAG_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  RAG_DEFAULT_COLLECTION: z.string().default('pdf_chunks'),
  RAG_MAX_CHUNK_SIZE: z.coerce.number().int().min(100).default(1000),
  
  // LLM
  LLM_DEFAULT_PROVIDER: z.string().default('ollama'),
  LLM_DEFAULT_MODEL: z.string().default('gpt-oss:latest'),
  LLM_LOAD_BALANCING: z.enum(['round_robin', 'cost_priority_round_robin']).default('round_robin'),
  
  // OpenAI
  LLM_OPENAI_ENABLED: z.coerce.boolean().default(false),
  OPENAI_API_KEY: z.string().optional(),
  LLM_OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_OPENAI_PRIORITY: z.coerce.number().int().min(0).default(1),
  
  // Anthropic
  LLM_ANTHROPIC_ENABLED: z.coerce.boolean().default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com/v1'),
  LLM_ANTHROPIC_PRIORITY: z.coerce.number().int().min(0).default(2),
  
  // Google
  LLM_GOOGLE_ENABLED: z.coerce.boolean().default(false),
  GOOGLE_API_KEY: z.string().optional(),
  LLM_GOOGLE_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  LLM_GOOGLE_PRIORITY: z.coerce.number().int().min(0).default(3),
  
  // Ollama
  LLM_OLLAMA_ENABLED: z.coerce.boolean().default(true),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  LLM_OLLAMA_PRIORITY: z.coerce.number().int().min(0).default(4),
  
  // MCP
  MCP_NOTION_ENABLED: z.coerce.boolean().default(false),
  NOTION_API_KEY: z.string().optional(),
  
  MCP_JIRA_ENABLED: z.coerce.boolean().default(false),
  JIRA_URL: z.string().url().optional(),
  JIRA_USERNAME: z.string().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_PROJECT_KEY: z.string().optional(),
  
  MCP_GOOGLE_ENABLED: z.coerce.boolean().default(false),
  GOOGLE_OAUTH_CREDENTIALS: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),
});

// Circuit Breaker Schema
const circuitBreakerSchema = z.object({
  failureThreshold: z.number().int().min(1).default(5),
  successThreshold: z.number().int().min(1).default(3),
  timeout: z.number().int().min(1000).default(60000),
});

// Retry Schema
const retrySchema = z.object({
  maxAttempts: z.number().int().min(1).default(3),
  initialDelay: z.number().int().min(100).default(1000),
  maxDelay: z.number().int().min(1000).default(30000),
  factor: z.number().min(1).default(2),
});

// LLM Provider Schema
const llmProviderSchema = z.object({
  name: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  priority: z.number().int().min(0),
  circuitBreaker: circuitBreakerSchema,
  retry: retrySchema,
});

// Model Schema
const modelSchema = z.object({
  name: z.string(),
  costPer1kInputTokens: z.number().min(0).default(0),
  costPer1kOutputTokens: z.number().min(0).default(0),
  maxTokens: z.number().int().min(1).default(4096),
});

// Configuration Schema
const configSchema = z.object({
  env: z.enum(['development', 'test', 'production']),
  server: z.object({
    port: z.number().int().min(1).max(65535),
    host: z.string().ip(),
  }),
  database: z.object({
    path: z.string(),
  }),
  vectorDb: z.object({
    chroma: z.object({
      host: z.string(),
      port: z.number().int().min(1).max(65535),
    }),
  }),
  rag: z.object({
    enabled: z.boolean(),
    embeddingModel: z.string(),
    defaultCollection: z.string(),
    maxChunkSize: z.number().int().min(100),
  }),
  llm: z.object({
    defaultProvider: z.string(),
    defaultModel: z.string(),
    loadBalancingStrategy: z.enum(['round_robin', 'cost_priority_round_robin']),
    providers: z.object({
      openai: llmProviderSchema,
      anthropic: llmProviderSchema,
      google: llmProviderSchema,
      ollama: llmProviderSchema.omit({ apiKey: true }),
    }),
  }),
  mcp: z.object({
    notion: z.object({
      enabled: z.boolean(),
      apiKey: z.string().optional(),
    }),
    jira: z.object({
      enabled: z.boolean(),
      url: z.string().url().optional(),
      username: z.string().optional(),
      apiToken: z.string().optional(),
      projectKey: z.string().optional(),
    }),
    google: z.object({
      enabled: z.boolean(),
      oauthCredentials: z.string().optional(),
      calendarId: z.string(),
    }),
  }),
});

// Type definitions
export type Config = z.infer<typeof configSchema>;
export type LLMProvider = z.infer<typeof llmProviderSchema>;
export type Model = z.infer<typeof modelSchema>;
export type CircuitBreaker = z.infer<typeof circuitBreakerSchema>;
export type Retry = z.infer<typeof retrySchema>;

// Default models for each provider
const getDefaultModels = (providerType: string): Model[] => {
  switch (providerType) {
    case 'openai':
      return [
        {
          name: 'gpt-3.5-turbo',
          costPer1kInputTokens: 0.0015,
          costPer1kOutputTokens: 0.002,
          maxTokens: 4096
        },
        {
          name: 'gpt-4',
          costPer1kInputTokens: 0.03,
          costPer1kOutputTokens: 0.06,
          maxTokens: 8192
        },
        {
          name: 'gpt-4-turbo',
          costPer1kInputTokens: 0.01,
          costPer1kOutputTokens: 0.03,
          maxTokens: 128000
        }
      ];
    case 'anthropic':
      return [
        {
          name: 'claude-3-opus-20240229',
          costPer1kInputTokens: 0.015,
          costPer1kOutputTokens: 0.075,
          maxTokens: 200000
        },
        {
          name: 'claude-3-sonnet-20240229',
          costPer1kInputTokens: 0.003,
          costPer1kOutputTokens: 0.015,
          maxTokens: 200000
        }
      ];
    case 'google':
      return [
        {
          name: 'gemini-pro',
          costPer1kInputTokens: 0.00025,
          costPer1kOutputTokens: 0.0005,
          maxTokens: 30720
        }
      ];
    case 'ollama':
      return [
        {
          name: 'gpt-oss:latest',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 4096
        },
        {
          name: 'llama2',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 4096
        }
      ];
    default:
      return [];
  }
};

// Load and validate configuration
function loadConfig(): Config {
  // Parse environment variables
  const env = envSchema.parse(process.env);
  
  // Try to load local config file
  let fileConfig = {};
  const localConfigPath = path.resolve(__dirname, './config/local.json');
  
  try {
    const rawData = fs.readFileSync(localConfigPath, 'utf8');
    fileConfig = JSON.parse(rawData);
    console.log(`✅ Loaded configuration from: ${localConfigPath}`);
  } catch (error) {
    if ((error as any).code !== 'ENOENT') {
      console.warn(`⚠️ Warning loading config file ${localConfigPath}:`, error);
    }
    console.log(`📄 Using environment variables and defaults`);
  }
  
  // Build configuration object from environment variables
  const config: Config = {
    env: env.NODE_ENV,
    server: {
      port: env.PORT,
      host: env.HOST,
    },
    database: {
      path: env.DATABASE_PATH,
    },
    vectorDb: {
      chroma: {
        host: env.CHROMA_HOST,
        port: env.CHROMA_PORT,
      },
    },
    rag: {
      enabled: env.RAG_ENABLED,
      embeddingModel: env.RAG_EMBEDDING_MODEL,
      defaultCollection: env.RAG_DEFAULT_COLLECTION,
      maxChunkSize: env.RAG_MAX_CHUNK_SIZE,
    },
    llm: {
      defaultProvider: env.LLM_DEFAULT_PROVIDER,
      defaultModel: env.LLM_DEFAULT_MODEL,
      loadBalancingStrategy: env.LLM_LOAD_BALANCING,
      providers: {
        openai: {
          name: 'openai',
          type: 'openai',
          enabled: env.LLM_OPENAI_ENABLED,
          apiKey: env.OPENAI_API_KEY,
          baseUrl: env.LLM_OPENAI_BASE_URL,
          priority: env.LLM_OPENAI_PRIORITY,
          circuitBreaker: { failureThreshold: 5, successThreshold: 3, timeout: 60000 },
          retry: { maxAttempts: 3, initialDelay: 1000, maxDelay: 30000, factor: 2 },
        },
        anthropic: {
          name: 'anthropic',
          type: 'anthropic',
          enabled: env.LLM_ANTHROPIC_ENABLED,
          apiKey: env.ANTHROPIC_API_KEY,
          baseUrl: env.LLM_ANTHROPIC_BASE_URL,
          priority: env.LLM_ANTHROPIC_PRIORITY,
          circuitBreaker: { failureThreshold: 5, successThreshold: 3, timeout: 60000 },
          retry: { maxAttempts: 3, initialDelay: 1000, maxDelay: 30000, factor: 2 },
        },
        google: {
          name: 'google',
          type: 'google',
          enabled: env.LLM_GOOGLE_ENABLED,
          apiKey: env.GOOGLE_API_KEY,
          baseUrl: env.LLM_GOOGLE_BASE_URL,
          priority: env.LLM_GOOGLE_PRIORITY,
          circuitBreaker: { failureThreshold: 5, successThreshold: 3, timeout: 60000 },
          retry: { maxAttempts: 3, initialDelay: 1000, maxDelay: 30000, factor: 2 },
        },
        ollama: {
          name: 'ollama',
          type: 'ollama',
          enabled: env.LLM_OLLAMA_ENABLED,
          baseUrl: env.OLLAMA_BASE_URL,
          priority: env.LLM_OLLAMA_PRIORITY,
          circuitBreaker: { failureThreshold: 3, successThreshold: 1, timeout: 10000 },
          retry: { maxAttempts: 2, initialDelay: 500, maxDelay: 10000, factor: 1.5 },
        },
      },
    },
    mcp: {
      notion: {
        enabled: env.MCP_NOTION_ENABLED,
        apiKey: env.NOTION_API_KEY,
      },
      jira: {
        enabled: env.MCP_JIRA_ENABLED,
        url: env.JIRA_URL,
        username: env.JIRA_USERNAME,
        apiToken: env.JIRA_API_TOKEN,
        projectKey: env.JIRA_PROJECT_KEY,
      },
      google: {
        enabled: env.MCP_GOOGLE_ENABLED,
        oauthCredentials: env.GOOGLE_OAUTH_CREDENTIALS,
        calendarId: env.GOOGLE_CALENDAR_ID,
      },
    },
  };
  
  // Merge with file config if available
  const mergedConfig = { ...config, ...fileConfig };
  
  // Validate the final configuration
  try {
    return configSchema.parse(mergedConfig);
  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    if (error instanceof z.ZodError) {
      console.error('Validation errors:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

// Load configuration
export const config = loadConfig();
export default config;

// Helper functions to get specific configuration sections
export const getServerConfig = () => config.server;
export const getDatabaseConfig = () => config.database;
export const getVectorDbConfig = () => config.vectorDb;
export const getRagConfig = () => config.rag;
export const getLlmConfig = () => config.llm;
export const getMcpConfig = () => config.mcp;

// Helper to get LLM providers in priority order with models
export const getLlmProviders = (): Array<LLMProvider & { models: Model[] }> => {
  const providers: Array<LLMProvider & { models: Model[] }> = [];
  const llmConfig = config.llm;
  
  Object.values(llmConfig.providers).forEach(provider => {
    if (provider.enabled) {
      providers.push({
        ...provider,
        models: getDefaultModels(provider.type),
      });
    }
  });
  
  // Sort by priority (descending)
  return providers.sort((a, b) => b.priority - a.priority);
};

// Convert to LLM Router format
export const toLlmRouterConfig = () => {
  const llmConfig = config.llm;
  const providers = getLlmProviders();

  return {
    loadBalancingStrategy: llmConfig.loadBalancingStrategy,
    defaultModel: llmConfig.defaultModel,
    providers: providers.map(provider => ({
      name: provider.name,
      type: provider.type,
      enabled: provider.enabled,
      priority: provider.priority,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      models: provider.models,
      circuitBreaker: provider.circuitBreaker,
      retry: provider.retry,
    })),
  };
};

// Validate environment variables on startup
export function validateConfig() {
  console.log('🔍 Validating configuration...');
  
  // Check required API keys for enabled providers
  const warnings: string[] = [];
  
  if (config.llm.providers.openai.enabled && !config.llm.providers.openai.apiKey) {
    warnings.push('OpenAI is enabled but OPENAI_API_KEY is not set');
  }
  
  if (config.llm.providers.anthropic.enabled && !config.llm.providers.anthropic.apiKey) {
    warnings.push('Anthropic is enabled but ANTHROPIC_API_KEY is not set');
  }
  
  if (config.llm.providers.google.enabled && !config.llm.providers.google.apiKey) {
    warnings.push('Google is enabled but GOOGLE_API_KEY is not set');
  }
  
  if (config.mcp.notion.enabled && !config.mcp.notion.apiKey) {
    warnings.push('Notion MCP is enabled but NOTION_API_KEY is not set');
  }
  
  if (config.mcp.jira.enabled) {
    if (!config.mcp.jira.url) warnings.push('Jira MCP is enabled but JIRA_URL is not set');
    if (!config.mcp.jira.username) warnings.push('Jira MCP is enabled but JIRA_USERNAME is not set');
    if (!config.mcp.jira.apiToken) warnings.push('Jira MCP is enabled but JIRA_API_TOKEN is not set');
  }
  
  if (config.mcp.google.enabled && !config.mcp.google.oauthCredentials) {
    warnings.push('Google MCP is enabled but GOOGLE_OAUTH_CREDENTIALS is not set');
  }
  
  if (warnings.length > 0) {
    console.log('⚠️ Configuration warnings:');
    warnings.forEach(warning => console.log(`  - ${warning}`));
  } else {
    console.log('✅ Configuration validation passed');
  }
  
  return warnings.length === 0;
}
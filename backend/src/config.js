import dotenv from 'dotenv';
import { z } from 'zod';
import { info, warn, error, debug } from './utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const boolSchema = (defaultVal = false) =>
  z.preprocess((val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return defaultVal;
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RUNTIME_MODE: z.enum(['rag_only', 'full']).default('full'),
  ROUTER_ROLLOUT_MODE: z.enum(['off', 'shadow', 'enforced']).default('enforced'),
  ROUTER_ROLLOUT_PERCENT: z.coerce.number().int().min(0).max(100).default(100),
  ROUTER_LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.45),
  ROUTER_SUCCESS_DOMAIN_ACCURACY: z.coerce.number().min(0).max(1).default(0.9),
  ROUTER_SUCCESS_UNWANTED_RAG_MAX: z.coerce.number().min(0).max(1).default(0.05),
  ROUTER_SUCCESS_TOOL_GROUNDED_MIN: z.coerce.number().min(0).max(1).default(0.95),
  ROUTER_SUCCESS_EM_USEFULNESS_MIN: z.coerce.number().min(0).max(1).default(0.8),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().ip().default('127.0.0.1'),
  DATABASE_URL: z.string().url().default('postgresql://taskflow:taskflow@localhost:5432/taskflow_backend'),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().optional(),
  RAG_ENABLED: boolSchema(true),
  RAG_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  RAG_EMBEDDING_PROVIDER: z.string().default('qwen3-vl'),
  RAG_DEFAULT_COLLECTION: z.string().default('pdf_chunks'),
  RAG_MAX_CHUNK_SIZE: z.coerce.number().int().min(100).default(1000),
  RAG_TOP_K: z.coerce.number().int().min(1).default(6),
  RAG_ADVANCED_ENABLED: z.coerce.boolean().default(false),
  RAG_ADVANCED_QUERY_REWRITE: z.coerce.boolean().default(true),
  RAG_ADVANCED_MAX_QUERIES: z.coerce.number().int().min(1).default(3),
  RAG_ADVANCED_INITIAL_K: z.coerce.number().int().min(1).default(30),
  RAG_ADVANCED_RETRIEVAL_STRATEGY: z.enum(['similarity', 'mmr']).default('mmr'),
  RAG_ADVANCED_MMR_LAMBDA: z.coerce.number().min(0).max(1).default(0.7),
  RAG_ADVANCED_COMPRESSION_ENABLED: z.coerce.boolean().default(true),
  LLM_DEFAULT_PROVIDER: z.string().default('ollama'),
  LLM_DEFAULT_MODEL: z.string().default('hermes3:8b'),
  LLM_LOAD_BALANCING: z.enum(['round_robin', 'cost_priority_round_robin']).default('round_robin'),
  LLM_OPENAI_ENABLED: z.coerce.boolean().default(false),
  OPENAI_API_KEY: z.string().optional(),
  LLM_OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_OPENAI_PRIORITY: z.coerce.number().int().min(0).default(1),
  LLM_ANTHROPIC_ENABLED: z.coerce.boolean().default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com/v1'),
  LLM_ANTHROPIC_PRIORITY: z.coerce.number().int().min(0).default(2),
  LLM_GOOGLE_ENABLED: z.coerce.boolean().default(false),
  GOOGLE_API_KEY: z.string().optional(),
  LLM_GOOGLE_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_GOOGLE_PRIORITY: z.coerce.number().int().min(0).default(3),
  LLM_OLLAMA_ENABLED: z.coerce.boolean().default(true),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  LLM_OLLAMA_PRIORITY: z.coerce.number().int().min(0).default(1),
  MCP_NOTION_ENABLED: boolSchema(true),
  NOTION_API_KEY: z.string().optional(),
  MCP_JIRA_ENABLED: boolSchema(true),
  JIRA_URL: z.string().default('https://example.jira.com'),
  JIRA_USERNAME: z.string().default(''),
  JIRA_API_TOKEN: z.string().default(''),
  JIRA_PROJECT_KEY: z.string().default(''),
  MCP_GITHUB_ENABLED: boolSchema(true),
  GITHUB_TOKEN: z.string().optional(),
  MCP_GOOGLE_ENABLED: boolSchema(false),
  GOOGLE_OAUTH_CREDENTIALS: z.string().optional(),
  PYTHON_AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  ENABLE_DORA_AGENT: boolSchema(true),
  ENABLE_SBI_AGENT: boolSchema(true),
  ENABLE_PEOPLE_AGENT: boolSchema(true),
  ENABLE_DELIVERY_AGENT: boolSchema(true),
  ENABLE_RETRO_AGENT: boolSchema(true),
  ENABLE_SPRINT_AGENT: boolSchema(true),
  ENABLE_SOP_AGENT: boolSchema(true),
  ENABLE_ROADMAP_AGENT: boolSchema(true),
  ENABLE_OKR_AGENT: boolSchema(true),
  ENABLE_CRITIC_AGENT: boolSchema(true),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),
  LEGACY_QUERY_API_ENABLED: z.coerce.boolean().default(true),
  LEGACY_RAG_INGEST_API_ENABLED: z.coerce.boolean().default(true),
  LEGACY_THREAD_API_ENABLED: z.coerce.boolean().default(true),
  LEGACY_RAG_DOCUMENT_API_ENABLED: z.coerce.boolean().default(true),
  LEGACY_ROUTER_METRICS_API_ENABLED: z.coerce.boolean().default(true),
  SESSION_INACTIVITY_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  SESSION_CLEANUP_ENABLED: boolSchema(true),
  SESSION_CLEANUP_CRON_SCHEDULE: z.string().default('0 3 * * *'),
  SESSION_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(10).max(5000).default(500),
});

const circuitBreakerSchema = z.object({
  failureThreshold: z.number().int().min(1).default(5),
  successThreshold: z.number().int().min(1).default(3),
  timeout: z.number().int().min(1000).default(60000),
});

const retrySchema = z.object({
  maxAttempts: z.number().int().min(1).default(3),
  initialDelay: z.number().int().min(100).default(1000),
  maxDelay: z.number().int().min(1000).default(30000),
  factor: z.number().min(1).default(2),
});

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

const configSchema = z.object({
  env: z.enum(['development', 'test', 'production']),
  runtime: z.object({
    mode: z.enum(['rag_only', 'full']),
    router: z.object({
      rolloutMode: z.enum(['off', 'shadow', 'enforced']),
      rolloutPercent: z.number().int().min(0).max(100),
      lowConfidenceThreshold: z.number().min(0).max(1),
      successGates: z.object({
        domainSelectionAccuracyMin: z.number().min(0).max(1),
        unwantedRagRateMax: z.number().min(0).max(1),
        toolGroundedRateMin: z.number().min(0).max(1),
        emUsefulnessMin: z.number().min(0).max(1),
      }),
    }),
  }),
  server: z.object({
    port: z.number().int().min(1).max(65535),
    host: z.string().ip(),
  }),
  database: z.object({
    url: z.string().url(),
  }),
  rag: z.object({
    enabled: z.boolean(),
    embeddingModel: z.string(),
    embeddingProvider: z.string(),
    defaultCollection: z.string(),
    maxChunkSize: z.number().int().min(100),
    topK: z.number().int().min(1),
  }),
  ragAdvanced: z.object({
    enabled: z.boolean(),
    queryRewrite: z.object({
      enabled: z.boolean(),
      maxQueries: z.number().int().min(1),
    }),
    retrieval: z.object({
      strategy: z.enum(['similarity', 'mmr']),
      mmrLambda: z.number().min(0).max(1),
      initialK: z.number().int().min(1),
    }),
    compression: z.object({
      enabled: z.boolean(),
    }),
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
      url: z.string().optional(),
      username: z.string().optional(),
      apiToken: z.string().optional(),
      projectKey: z.string().optional(),
    }),
    github: z.object({
      enabled: z.boolean(),
      token: z.string().optional(),
      owner: z.string().optional(),
    }),
    google: z.object({
      enabled: z.boolean(),
      oauthCredentials: z.string().optional(),
      calendarId: z.string(),
    }),
  }),
  api: z.object({
    legacy: z.object({
      query: z.object({
        enabled: z.boolean(),
      }),
      ragIngest: z.object({
        enabled: z.boolean(),
      }),
      threads: z.object({
        enabled: z.boolean(),
      }),
      ragDocuments: z.object({
        enabled: z.boolean(),
      }),
      routerMetrics: z.object({
        enabled: z.boolean(),
      }),
    }),
  }),
  ENABLE_DORA_AGENT: z.boolean(),
  ENABLE_SBI_AGENT: z.boolean(),
  ENABLE_PEOPLE_AGENT: z.boolean(),
  ENABLE_DELIVERY_AGENT: z.boolean(),
  ENABLE_RETRO_AGENT: z.boolean(),
  ENABLE_SPRINT_AGENT: z.boolean(),
  ENABLE_SOP_AGENT: z.boolean(),
  ENABLE_ROADMAP_AGENT: z.boolean(),
  ENABLE_OKR_AGENT: z.boolean(),
  ENABLE_CRITIC_AGENT: z.boolean(),
  agents: z.object({
    dora: z.boolean(),
    sbi: z.boolean(),
    people: z.boolean(),
    delivery: z.boolean(),
    retro: z.boolean(),
    sprint: z.boolean(),
    sop: z.boolean(),
    roadmap: z.boolean(),
    okr: z.boolean(),
    critic: z.boolean(),
  }),
  PYTHON_AI_SERVICE_URL: z.string(),
});

const getDefaultModels = (providerType) => {
  switch (providerType) {
    case 'openai':
      return [
        {
          name: 'gpt-3.5-turbo',
          costPer1kInputTokens: 0.0015,
          costPer1kOutputTokens: 0.002,
          maxTokens: 4096,
        },
        {
          name: 'gpt-4',
          costPer1kInputTokens: 0.03,
          costPer1kOutputTokens: 0.06,
          maxTokens: 8192,
        },
        {
          name: 'gpt-4-turbo',
          costPer1kInputTokens: 0.01,
          costPer1kOutputTokens: 0.03,
          maxTokens: 128000,
        },
      ];
    case 'anthropic':
      return [
        {
          name: 'claude-3-opus-20240229',
          costPer1kInputTokens: 0.015,
          costPer1kOutputTokens: 0.075,
          maxTokens: 200000,
        },
        {
          name: 'claude-3-sonnet-20240229',
          costPer1kInputTokens: 0.003,
          costPer1kOutputTokens: 0.015,
          maxTokens: 200000,
        },
      ];
    case 'google':
      return [
        {
          name: 'gemini-pro',
          costPer1kInputTokens: 0.00025,
          costPer1kOutputTokens: 0.0005,
          maxTokens: 30720,
        },
      ];
    case 'ollama':
      return [
        {
          name: 'hermes3:8b',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 8192,
        },
        {
          name: 'gpt-oss:latest',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 4096,
        },
        {
          name: 'llama2',
          costPer1kInputTokens: 0,
          costPer1kOutputTokens: 0,
          maxTokens: 4096,
        },
      ];
    default:
      return [];
  }
};

function loadConfig() {
  const env = envSchema.parse(process.env);

  let fileConfig = {};
  const localConfigPath = path.resolve(__dirname, './config/local.json');

  try {
    const rawData = fs.readFileSync(localConfigPath, 'utf8');
    fileConfig = JSON.parse(rawData);
    debug({ module: 'config', action: 'loadConfig', localConfigPath }, `Loaded configuration from: ${localConfigPath}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      warn({ module: 'config', action: 'loadConfig', localConfigPath, err }, `Warning loading config file ${localConfigPath}`);
    }
    debug({ module: 'config', action: 'loadConfig' }, 'Using environment variables and defaults');
  }

  const config = {
    env: env.NODE_ENV,
    runtime: {
      mode: env.RUNTIME_MODE,
      router: {
        rolloutMode: env.ROUTER_ROLLOUT_MODE,
        rolloutPercent: env.ROUTER_ROLLOUT_PERCENT,
        lowConfidenceThreshold: env.ROUTER_LOW_CONFIDENCE_THRESHOLD,
        successGates: {
          domainSelectionAccuracyMin: env.ROUTER_SUCCESS_DOMAIN_ACCURACY,
          unwantedRagRateMax: env.ROUTER_SUCCESS_UNWANTED_RAG_MAX,
          toolGroundedRateMin: env.ROUTER_SUCCESS_TOOL_GROUNDED_MIN,
          emUsefulnessMin: env.ROUTER_SUCCESS_EM_USEFULNESS_MIN,
        },
      },
    },
    server: {
      port: env.PORT,
      host: env.HOST,
    },
    database: {
      url: env.DATABASE_URL,
    },
    rag: {
      enabled: env.RAG_ENABLED,
      embeddingModel: env.RAG_EMBEDDING_MODEL,
      embeddingProvider: env.RAG_EMBEDDING_PROVIDER,
      defaultCollection: env.RAG_DEFAULT_COLLECTION,
      maxChunkSize: env.RAG_MAX_CHUNK_SIZE,
      topK: env.RAG_TOP_K,
    },
    ragAdvanced: {
      enabled: env.RAG_ADVANCED_ENABLED,
      queryRewrite: {
        enabled: env.RAG_ADVANCED_QUERY_REWRITE,
        maxQueries: env.RAG_ADVANCED_MAX_QUERIES,
      },
      retrieval: {
        strategy: env.RAG_ADVANCED_RETRIEVAL_STRATEGY,
        mmrLambda: env.RAG_ADVANCED_MMR_LAMBDA,
        initialK: env.RAG_ADVANCED_INITIAL_K,
      },
      compression: {
        enabled: env.RAG_ADVANCED_COMPRESSION_ENABLED,
      },
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
      github: {
        enabled: env.MCP_GITHUB_ENABLED,
        token: env.GITHUB_TOKEN,
        owner: env.GITHUB_OWNER || env.GITHUB_USERNAME,
      },
      google: {
        enabled: env.MCP_GOOGLE_ENABLED,
        oauthCredentials: env.GOOGLE_OAUTH_CREDENTIALS,
        calendarId: env.GOOGLE_CALENDAR_ID,
      },
    },
    api: {
      legacy: {
        query: {
          enabled: env.LEGACY_QUERY_API_ENABLED,
        },
        ragIngest: {
          enabled: env.LEGACY_RAG_INGEST_API_ENABLED,
        },
        threads: {
          enabled: env.LEGACY_THREAD_API_ENABLED,
        },
        ragDocuments: {
          enabled: env.LEGACY_RAG_DOCUMENT_API_ENABLED,
        },
        routerMetrics: {
          enabled: env.LEGACY_ROUTER_METRICS_API_ENABLED,
        },
      },
    },
    ENABLE_DORA_AGENT: env.ENABLE_DORA_AGENT,
    ENABLE_SBI_AGENT: env.ENABLE_SBI_AGENT,
    ENABLE_PEOPLE_AGENT: env.ENABLE_PEOPLE_AGENT,
    ENABLE_DELIVERY_AGENT: env.ENABLE_DELIVERY_AGENT,
    ENABLE_RETRO_AGENT: env.ENABLE_RETRO_AGENT,
    ENABLE_SPRINT_AGENT: env.ENABLE_SPRINT_AGENT,
    ENABLE_SOP_AGENT: env.ENABLE_SOP_AGENT,
    ENABLE_ROADMAP_AGENT: env.ENABLE_ROADMAP_AGENT,
    ENABLE_OKR_AGENT: env.ENABLE_OKR_AGENT,
    ENABLE_CRITIC_AGENT: env.ENABLE_CRITIC_AGENT,
    agents: {
      dora: env.ENABLE_DORA_AGENT,
      sbi: env.ENABLE_SBI_AGENT,
      people: env.ENABLE_PEOPLE_AGENT,
      delivery: env.ENABLE_DELIVERY_AGENT,
      retro: env.ENABLE_RETRO_AGENT,
      sprint: env.ENABLE_SPRINT_AGENT,
      sop: env.ENABLE_SOP_AGENT,
      roadmap: env.ENABLE_ROADMAP_AGENT,
      okr: env.ENABLE_OKR_AGENT,
      critic: env.ENABLE_CRITIC_AGENT,
    },
    PYTHON_AI_SERVICE_URL: env.PYTHON_AI_SERVICE_URL,
  };

  const mergedConfig = { ...config, ...fileConfig };

  try {
    return configSchema.parse(mergedConfig);
  } catch (err) {
    error({ module: 'config', action: 'validateSchema', err }, 'Configuration validation failed');
    process.exit(1);
  }
}

export const config = loadConfig();
export default config;

export const getServerConfig = () => config.server;
export const getRuntimeConfig = () => config.runtime;
export const getDatabaseConfig = () => ({
  url: process.env.DATABASE_URL || config.database.url,
});
export const getVectorDbConfig = () => config.vectorDb;
export const getRagConfig = () => config.rag;
export const getRagAdvancedConfig = () => config.ragAdvanced;
export const getLlmConfig = () => config.llm;
export const getMcpConfig = () => config.mcp;
export const getApiConfig = () => config.api;
export const getAgentConfig = () => config.agents;

export const getLlmProviders = () => {
  const providers = [];
  const llmConfig = config.llm;

  Object.values(llmConfig.providers).forEach((provider) => {
    if (provider.enabled) {
      providers.push({
        ...provider,
        models: getDefaultModels(provider.type),
      });
    }
  });

  return providers.sort((a, b) => b.priority - a.priority);
};



export function validateConfig() {
  debug({ module: 'config', action: 'validateConfig' }, 'Validating configuration...');

  const warnings = [];

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
    warn({ module: 'config', action: 'validateConfig', warnings }, 'Configuration warnings detected');
  } else {
    debug({ module: 'config', action: 'validateConfig' }, 'Configuration validation passed');
  }

  return warnings.length === 0;
}

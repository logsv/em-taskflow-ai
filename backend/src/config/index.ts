import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { configSchema } from './schema.js';

// Load configuration files based on environment
const env = process.env.NODE_ENV || 'development';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration file loading order (later files override earlier ones)
const configFiles = [
  path.resolve(__dirname, '../../src/config/local.json') // Single local config file for development
];

// Simple config loader that works around convict's sensitive value masking
let config: any = {};

configFiles.forEach(file => {
  console.log(`Attempting to load config from: ${file}`);
  try {
    // Read file directly
    const rawData = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(rawData);
    console.log('🔧 Raw file MCP data:', JSON.stringify(fileData.mcp, null, 2));
    
    // Merge with defaults and environment variables
    config = {
      ...fileData,
      // Apply environment variable overrides
      mcp: {
        notion: {
          enabled: process.env.MCP_NOTION_ENABLED === 'true' || fileData.mcp?.notion?.enabled || false,
          apiKey: process.env.NOTION_API_KEY || fileData.mcp?.notion?.apiKey || ''
        },
        jira: {
          enabled: process.env.MCP_JIRA_ENABLED === 'true' || fileData.mcp?.jira?.enabled || false,
          url: process.env.JIRA_URL || fileData.mcp?.jira?.url || '',
          username: process.env.JIRA_USERNAME || fileData.mcp?.jira?.username || '',
          apiToken: process.env.JIRA_API_TOKEN || fileData.mcp?.jira?.apiToken || '',
          projectKey: process.env.JIRA_PROJECT_KEY || fileData.mcp?.jira?.projectKey || ''
        },
        google: {
          enabled: process.env.MCP_GOOGLE_ENABLED === 'true' || fileData.mcp?.google?.enabled || false,
          oauthCredentials: process.env.GOOGLE_OAUTH_CREDENTIALS || fileData.mcp?.google?.oauthCredentials || '',
          calendarId: process.env.GOOGLE_CALENDAR_ID || fileData.mcp?.google?.calendarId || 'primary'
        }
      }
    };
    
    console.log(`Successfully loaded config from: ${file}`);
    console.log('🔧 Final config MCP section:', JSON.stringify(config.mcp, null, 2));
  } catch (error) {
    console.log(`Failed to load config from ${file}:`, error);
    // Ignore missing files, but log other errors
    if ((error as any).code !== 'ENOENT') {
      console.warn(`Warning loading config file ${file}:`, error);
    }
  }
});

// Export the validated configuration
export { config };
export default config;

// Export schema for testing
export { configSchema };

// Helper functions to get specific configuration sections
export const getServerConfig = () => config.server;
export const getDatabaseConfig = () => config.database;
export const getVectorDbConfig = () => config.vectorDb;
export const getRagConfig = () => config.rag;
export const getLlmConfig = () => config.llm;
export const getMcpConfig = () => config.mcp;

// Helper to get LLM providers in priority order
export const getLlmProviders = () => {
  const providers = [];
  const llmConfig = config.llm;
  
  if (llmConfig.providers.openai.enabled) {
    providers.push({
      ...llmConfig.providers.openai,
      models: [
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
      ]
    });
  }

  if (llmConfig.providers.anthropic.enabled) {
    providers.push({
      ...llmConfig.providers.anthropic,
      models: [
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
      ]
    });
  }

  if (llmConfig.providers.google.enabled) {
    providers.push({
      ...llmConfig.providers.google,
      models: [
        {
          name: 'gemini-pro',
          costPer1kInputTokens: 0.00025,
          costPer1kOutputTokens: 0.0005,
          maxTokens: 30720
        }
      ]
    });
  }

  if (llmConfig.providers.ollama.enabled) {
    providers.push({
      ...llmConfig.providers.ollama,
      models: [
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
      ]
    });
  }

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
      circuitBreaker: {
        failureThreshold: provider.circuitBreaker.failureThreshold,
        successThreshold: provider.circuitBreaker.successThreshold,
        timeout: provider.circuitBreaker.timeout
      },
      retry: {
        maxAttempts: provider.retry.maxAttempts,
        initialDelay: provider.retry.initialDelay,
        maxDelay: provider.retry.maxDelay,
        factor: provider.retry.factor
      }
    }))
  };
};
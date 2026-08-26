import fs from 'fs';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getLlmConfig } from '../config.js';
import { bgeEmbeddingsClient } from './bgeEmbeddingsClient.js';
import { info, warn } from '../utils/logger.js';

let chatModel = null;
let initialized = false;

function resolveOllamaBaseUrl(configuredUrl) {
  const inDocker = fs.existsSync('/.dockerenv');
  let url = configuredUrl || process.env.OLLAMA_BASE_URL || (inDocker ? 'http://host.docker.internal:11434' : 'http://localhost:11434');
  if (!inDocker && url.includes('host.docker.internal')) {
    url = url.replace('host.docker.internal', '127.0.0.1');
  }
  if (inDocker && url.includes('localhost')) {
    url = url.replace('localhost', 'host.docker.internal');
  }
  return url;
}

function createChatModelForProvider(providerKey, options = {}) {
  const llmConfig = getLlmConfig();
  const provider = llmConfig.providers[providerKey];

  if (!provider || !provider.enabled) {
    throw new Error(`LLM provider "${providerKey}" is not enabled or not configured`);
  }

  const modelName = options.model || llmConfig.defaultModel;
  const temperature = options.temperature ?? 0.1;

  let model;

  if (providerKey === 'ollama') {
    const rawBase = provider.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const base = resolveOllamaBaseUrl(rawBase).replace(/\/$/, '');
    const baseURL = `${base}/v1`;

    model = new ChatOpenAI({
      modelName,
      apiKey: 'ollama',
      configuration: {
        baseURL,
      },
      temperature,
    });
  } else if (providerKey === 'google') {
    const apiKey = provider.apiKey || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for Google Gemini provider');
    }

    // Subclass ChatGoogleGenerativeAI to fix message ordering before every LLM call.
    // Google Gemini allows EXACTLY ONE system message, and it must be at index 0.
    // LangGraph's supervisor framework adds multiple system messages during
    // multi-turn agent conversations. This subclass merges them into one.
    class GeminiWithMessageReorder extends ChatGoogleGenerativeAI {
      async _generate(messages, options, runManager) {
        if (Array.isArray(messages) && messages.length > 0) {
          const { SystemMessage: SM } = await import('@langchain/core/messages');
          const systemParts = [];
          const otherMsgs = [];
          for (const msg of messages) {
            const type = msg._getType?.() || '';
            if (type === 'system') {
              const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
              systemParts.push(content);
            } else {
              otherMsgs.push(msg);
            }
          }
          if (systemParts.length > 0) {
            const mergedSystem = new SM(systemParts.join('\n\n'));
            messages = [mergedSystem, ...otherMsgs];
          }
        }
        return super._generate(messages, options, runManager);
      }
    }

    model = new GeminiWithMessageReorder({
      model: modelName || 'gemini-2.5-flash',
      apiKey,
      temperature,
    });
  } else {
    const apiKey = provider.apiKey || process.env.OPENAI_API_KEY || 'EMPTY';

    model = new ChatOpenAI({
      modelName,
      apiKey: apiKey,
      configuration: {
        baseURL: provider.baseUrl,
      },
      temperature,
    });
  }

  return model;
}

/**
 * Initialize all LLM clients
 */
export async function initializeLLM(force = false) {
  if (initialized && chatModel && !force) return;

  const llmConfig = getLlmConfig();
  const providerKey = llmConfig.defaultProvider || 'ollama';
  const modelName = llmConfig.defaultModel || 'hermes3:8b';

  info({ module: 'llm', action: 'initializeLLM', provider: providerKey, model: modelName }, `Initializing LLM client (Provider: ${providerKey}, Model: ${modelName})`);

  try {
    chatModel = createChatModelForProvider(providerKey, {
      model: modelName,
      temperature: 0.1,
    });
  } catch (err) {
    warn({ module: 'llm', action: 'initializeLLMFallback', provider: providerKey, err }, `Primary LLM provider "${providerKey}" failed. Falling back to local Ollama`);
    chatModel = createChatModelForProvider('ollama', {
      model: modelName || 'hermes3:8b',
      temperature: 0.1,
    });
  }

  initialized = true;
  info({ module: 'llm', action: 'initializeLLMSuccess', model: modelName }, `LLM client initialized successfully (${modelName})`);
}

/**
 * Reset active cached LLM model so the next call picks up updated database settings
 */
export function resetChatModel() {
  chatModel = null;
  initialized = false;
}

/**
 * Set custom chat model instance (useful for unit test stubs/mocks)
 */
export function setChatModel(model) {
  chatModel = model;
  initialized = true;
}

/**
 * Get default chat model instance (singleton or custom options instance)
 */
export function getChatModel(options = null) {
  if (options && (options.temperature !== undefined || options.model !== undefined)) {
    return createChatModelInstance(options);
  }
  if (!chatModel) {
    const llmConfig = getLlmConfig();
    const providerKey = llmConfig.defaultProvider || 'ollama';
    chatModel = createChatModelForProvider(providerKey, {
      model: llmConfig.defaultModel || 'hermes3:8b',
      temperature: 0.1,
    });
    initialized = true;
  }
  return chatModel;
}


/**
 * Get Qwen3-VL embeddings client (external service)
 */
export function getBgeEmbeddings() {
  return bgeEmbeddingsClient;
}

/**
 * Check if LLM services are initialized
 */
export function isInitialized() {
  return initialized;
}

/**
 * Get LLM service status
 */
export async function getLLMStatus() {
  const status = {
    initialized,
    chatModel: !!chatModel,
    bgeEmbeddings: false,
  };

  try {
    status.bgeEmbeddings = await bgeEmbeddingsClient.isAvailable();
  } catch (error) {
  }

  return status;
}

/**
 * Create a new chat model instance with custom settings
 */
export function createChatModelInstance(options) {
  const llmConfig = getLlmConfig();
  const providerKey = llmConfig.defaultProvider || 'openai';

  return createChatModelForProvider(providerKey, options || {});
}

/**
 * Ensure LLM services are ready
 */
export async function ensureLLMReady() {
  if (!initialized) {
    await initializeLLM();
  }
}

// Re-export Qwen3-VL embeddings adapter
export { BGEEmbeddingsAdapter } from './bgeEmbeddingsAdapter.js';

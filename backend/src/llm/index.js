import fs from 'fs';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getLlmConfig } from '../config.js';
import { bgeEmbeddingsClient } from './bgeEmbeddingsClient.js';

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
export async function initializeLLM() {
  if (initialized) return;

  console.log('🤖 Initializing local Ollama LLM client...');
  
  const llmConfig = getLlmConfig();
  const providerKey = llmConfig.defaultProvider || 'ollama';

  try {
    chatModel = createChatModelForProvider(providerKey, {
      model: llmConfig.defaultModel || 'llama3.2:latest',
      temperature: 0.1,
    });
  } catch (err) {
    console.warn(`⚠️ Primary LLM provider "${providerKey}" failed (${err.message}). Falling back to local Ollama...`);
    chatModel = createChatModelForProvider('ollama', {
      model: 'llama3.2:latest',
      temperature: 0.1,
    });
  }

  initialized = true;
  console.log('✅ Local Ollama LLM client initialized successfully');
}

/**
 * Get default chat model instance (singleton)
 */
export function getChatModel() {
  if (!chatModel) {
    throw new Error('LLM not initialized. Call initializeLLM() first.');
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

import { ChatOpenAI } from '@langchain/openai';
import { getLlmConfig, getRagConfig } from '../config.js';
import { bgeEmbeddingsClient } from './bgeEmbeddingsClient.js';
import { bgeRerankerClient } from './bgeRerankerClient.js';

let chatModel = null;
let initialized = false;

function createChatModelForProvider(providerKey, options = {}) {
  const llmConfig = getLlmConfig();
  const provider = llmConfig.providers[providerKey];

  if (!provider || !provider.enabled) {
    throw new Error(`LLM provider "${providerKey}" is not enabled or not configured`);
  }

  const modelName = options.model || llmConfig.defaultModel || 'gpt-4o-mini';
  const temperature = options.temperature ?? 0.1;

  let model;

  if (providerKey === 'ollama') {
    const base = provider.baseUrl?.replace(/\/$/, '') || 'http://localhost:11434';
    const baseURL = `${base}/v1`;

    model = new ChatOpenAI({
      modelName,
      openAIApiKey: 'ollama',
      configuration: {
        baseURL,
      },
      temperature,
    });
  } else {
    const apiKey = provider.apiKey || process.env.OPENAI_API_KEY || 'EMPTY';

    model = new ChatOpenAI({
      modelName,
      openAIApiKey: apiKey,
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

  console.log('🤖 Initializing LLM clients...');
  
  const llmConfig = getLlmConfig();
  const providerKey = llmConfig.defaultProvider || 'openai';

  chatModel = createChatModelForProvider(providerKey, {
    model: llmConfig.defaultModel,
    temperature: 0.1,
  });

  initialized = true;
  console.log('✅ LLM clients initialized successfully');
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
 * Get Qwen3-VL reranker client (external service)  
 */
export function getBgeReranker() {
  return bgeRerankerClient;
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
    bgeReranker: false,
  };

  try {
    status.bgeEmbeddings = await bgeEmbeddingsClient.isAvailable();
  } catch (error) {
  }

  try {
    status.bgeReranker = await bgeRerankerClient.isAvailable();
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

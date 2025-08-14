/**
 * LLM module - Singleton clients for ChatOllama, embeddings, and BGE services
 * Provides centralized access to all LLM-related functionality
 */

import { ChatOllama } from '@langchain/ollama';
import { OllamaEmbeddings } from '@langchain/ollama';
import { config, getLlmConfig } from '../config.js';
import { bgeEmbeddingsClient } from '../services/bgeEmbeddingsClient.js';
import { bgeRerankerClient } from '../services/bgeRerankerClient.js';

// Singleton instances
let chatOllama: ChatOllama | null = null;
let ollamaEmbeddings: OllamaEmbeddings | null = null;
let initialized = false;

/**
 * Initialize all LLM clients
 */
export async function initializeLLM(): Promise<void> {
  if (initialized) return;

  console.log('🤖 Initializing LLM clients...');
  
  const llmConfig = getLlmConfig();
  const ollamaConfig = llmConfig.providers.ollama;

  // Initialize ChatOllama for text generation
  chatOllama = new ChatOllama({
    model: llmConfig.defaultModel || 'gpt-oss:latest',
    baseUrl: ollamaConfig.baseUrl,
    temperature: 0.1,
  });

  // Initialize Ollama embeddings (fallback)
  ollamaEmbeddings = new OllamaEmbeddings({
    model: 'nomic-embed-text',
    baseUrl: ollamaConfig.baseUrl,
  });

  initialized = true;
  console.log('✅ LLM clients initialized successfully');
}

/**
 * Get ChatOllama instance (singleton)
 */
export function getChatOllama(): ChatOllama {
  if (!chatOllama) {
    throw new Error('LLM not initialized. Call initializeLLM() first.');
  }
  return chatOllama;
}

/**
 * Get Ollama embeddings instance (singleton)
 */
export function getOllamaEmbeddings(): OllamaEmbeddings {
  if (!ollamaEmbeddings) {
    throw new Error('Ollama embeddings not initialized. Call initializeLLM() first.');
  }
  return ollamaEmbeddings;
}

/**
 * Get BGE embeddings client (external service)
 */
export function getBgeEmbeddings() {
  return bgeEmbeddingsClient;
}

/**
 * Get BGE reranker client (external service)  
 */
export function getBgeReranker() {
  return bgeRerankerClient;
}

/**
 * Check if LLM services are initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Get LLM service status
 */
export async function getLLMStatus(): Promise<{
  initialized: boolean;
  chatOllama: boolean;
  ollamaEmbeddings: boolean;
  bgeEmbeddings: boolean;
  bgeReranker: boolean;
}> {
  const status = {
    initialized,
    chatOllama: !!chatOllama,
    ollamaEmbeddings: !!ollamaEmbeddings,
    bgeEmbeddings: false,
    bgeReranker: false,
  };

  // Check BGE services availability
  try {
    status.bgeEmbeddings = await bgeEmbeddingsClient.isAvailable();
  } catch (error) {
    // BGE embeddings not available
  }

  try {
    status.bgeReranker = await bgeRerankerClient.isAvailable();
  } catch (error) {
    // BGE reranker not available
  }

  return status;
}

/**
 * Create a new ChatOllama instance with custom settings
 */
export function createChatOllama(options: {
  model?: string;
  temperature?: number;
  timeout?: number;
}): ChatOllama {
  const llmConfig = getLlmConfig();
  
  return new ChatOllama({
    model: options.model || 'gpt-oss:latest',
    baseUrl: llmConfig.providers.ollama.baseUrl,
    temperature: options.temperature ?? 0.1,
  });
}

/**
 * Ensure LLM services are ready
 */
export async function ensureLLMReady(): Promise<void> {
  if (!initialized) {
    await initializeLLM();
  }
}

// Re-export router functionality
export {
  initializeLLMRouter,
  getLLMRouter,
  routedChatCompletion,
  getRouterStatus,
  testRouter,
  isRouterInitialized,
} from './router.js';

// Re-export BGE adapter
export { BGEEmbeddingsAdapter } from './bgeEmbeddingsAdapter.js';

// Export singleton instances for backward compatibility
export { chatOllama, ollamaEmbeddings };
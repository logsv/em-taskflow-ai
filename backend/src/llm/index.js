/**
 * LLM module - Singleton clients for ChatOllama, embeddings, and BGE services
 * Provides centralized access to all LLM-related functionality
 */

import { ChatOllama } from '@langchain/ollama';
import { OllamaEmbeddings } from '@langchain/ollama';
import { getLlmConfig } from '../config.js';
import { bgeEmbeddingsClient } from '../services/bgeEmbeddingsClient.js';
import { bgeRerankerClient } from '../services/bgeRerankerClient.js';

// Singleton instances
let chatOllama = null;
let ollamaEmbeddings = null;
let initialized = false;

/**
 * Initialize all LLM clients
 */
export async function initializeLLM() {
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
export function getChatOllama() {
  if (!chatOllama) {
    throw new Error('LLM not initialized. Call initializeLLM() first.');
  }
  return chatOllama;
}

/**
 * Get Ollama embeddings instance (singleton)
 */
export function getOllamaEmbeddings() {
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
export function isInitialized() {
  return initialized;
}

/**
 * Get LLM service status
 */
export async function getLLMStatus() {
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
export function createChatOllama(options) {
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
export async function ensureLLMReady() {
  if (!initialized) {
    await initializeLLM();
  }
}

// Re-export BGE adapter
export { BGEEmbeddingsAdapter } from './bgeEmbeddingsAdapter.js';

// Export singleton instances for backward compatibility
export { chatOllama, ollamaEmbeddings };

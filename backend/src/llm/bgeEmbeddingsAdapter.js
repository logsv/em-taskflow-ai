/**
 * Qwen3-VL Embeddings Adapter for LangChain
 * Adapts Qwen3-VL Python service to LangChain Embeddings interface
 */

import { Embeddings } from '@langchain/core/embeddings';
import { getBgeEmbeddings } from './index.js';

/**
 * LangChain embeddings adapter for Qwen3-VL embeddings microservice
 */
export class BGEEmbeddingsAdapter extends Embeddings {
  constructor() {
    super({});
    this.bgeClient = getBgeEmbeddings();
  }

  /**
   * Embed documents using Qwen3-VL embeddings service
   */
  async embedDocuments(texts) {
    try {
      // Check if Qwen3-VL embeddings service is available
      const isAvailable = await this.bgeClient.isAvailable();
      if (!isAvailable) {
        throw new Error('Qwen3-VL embeddings service not available');
      }

      // Use Qwen3-VL service to embed documents
      const result = await this.bgeClient.embed(texts, true); // normalize=true
      
      // Extract embeddings from result
      if (result && Array.isArray(result.embeddings)) {
        return result.embeddings;
      }

      throw new Error('Invalid response format from Qwen3-VL embeddings service');

    } catch (error) {
      console.error('❌ Qwen3-VL embeddings failed:', error);
      throw error;
    }
  }

  /**
   * Embed query using Qwen3-VL embeddings service
   */
  async embedQuery(text) {
    try {
      const embeddings = await this.embedDocuments([text]);
      return embeddings[0];
    } catch (error) {
      console.error('❌ Qwen3-VL query embedding failed:', error);
      throw error;
    }
  }

  /**
   * Check if Qwen3-VL embeddings service is available
   */
  async isAvailable() {
    try {
      return await this.bgeClient.isAvailable();
    } catch (error) {
      return false;
    }
  }
}

/**
 * BGE Embeddings Adapter for LangChain
 * Adapts BGE Python service to LangChain Embeddings interface
 */

import { Embeddings } from '@langchain/core/embeddings';
import { getBgeEmbeddings } from './index.js';

/**
 * LangChain embeddings adapter for BGE-M3 Python service
 */
export class BGEEmbeddingsAdapter extends Embeddings {
  constructor() {
    super({});
    this.bgeClient = getBgeEmbeddings();
  }

  /**
   * Embed documents using BGE-M3 service
   */
  async embedDocuments(texts) {
    try {
      // Check if BGE service is available
      const isAvailable = await this.bgeClient.isAvailable();
      if (!isAvailable) {
        throw new Error('BGE embeddings service not available');
      }

      // Use BGE service to embed documents
      const result = await this.bgeClient.embed(texts, true); // normalize=true
      
      // Extract embeddings from result
      if (result && Array.isArray(result.embeddings)) {
        return result.embeddings;
      }

      throw new Error('Invalid response format from BGE embeddings service');

    } catch (error) {
      console.error('❌ BGE embeddings failed:', error);
      throw error;
    }
  }

  /**
   * Embed query using BGE-M3 service
   */
  async embedQuery(text) {
    try {
      const embeddings = await this.embedDocuments([text]);
      return embeddings[0];
    } catch (error) {
      console.error('❌ BGE query embedding failed:', error);
      throw error;
    }
  }

  /**
   * Check if BGE service is available
   */
  async isAvailable() {
    try {
      return await this.bgeClient.isAvailable();
    } catch (error) {
      return false;
    }
  }
}

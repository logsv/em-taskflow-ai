import axios from 'axios';

/**
 * Client for BGE-M3 Embeddings microservice
 * Provides high-quality multilingual embeddings
 */
export class BgeEmbeddingsClient {
  constructor(baseUrl = 'http://localhost:8001', timeout = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Check if the BGE-M3 service is healthy
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      throw new Error(`BGE embeddings service health check failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for input texts
   */
  async embed(texts, normalize = true) {
    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for embedding');
    }

    if (texts.length > 100) {
      throw new Error('Too many texts (max 100 per request)');
    }

    try {
      const request = {
        texts,
        normalize,
      };

      const response = await axios.post(`${this.baseUrl}/embed`, request, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.detail || error.message;
        throw new Error(`BGE embeddings failed (${status}): ${message}`);
      }
      throw new Error(`BGE embeddings request failed: ${error.message}`);
    }
  }

  /**
   * Batch embed with automatic chunking for large text arrays
   */
  async batchEmbed(texts, batchSize = 50, normalize = true) {
    if (texts.length <= batchSize) {
      const result = await this.embed(texts, normalize);
      return {
        embeddings: result.embeddings,
        processing_time: result.processing_time,
        batches_processed: 1,
      };
    }

    console.log(`📦 Processing ${texts.length} texts in batches of ${batchSize}`);
    
    const allEmbeddings = [];
    let totalProcessingTime = 0;
    let batchesProcessed = 0;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      console.log(`   Processing batch ${batchesProcessed + 1}/${Math.ceil(texts.length / batchSize)}...`);
      
      const result = await this.embed(batch, normalize);
      allEmbeddings.push(...result.embeddings);
      totalProcessingTime += result.processing_time;
      batchesProcessed++;

      // Small delay between batches to avoid overwhelming the service
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Completed ${batchesProcessed} batches in ${totalProcessingTime.toFixed(3)}s`);

    return {
      embeddings: allEmbeddings,
      processing_time: totalProcessingTime,
      batches_processed: batchesProcessed,
    };
  }

  /**
   * Check if the service is available
   */
  async isAvailable() {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy' && health.model_loaded;
    } catch {
      return false;
    }
  }

  /**
   * Get service information
   */
  async getInfo() {
    try {
      const health = await this.healthCheck();
      return {
        available: health.status === 'healthy' && health.model_loaded,
        model: health.model_name,
        dimensions: health.dimensions,
        baseUrl: this.baseUrl,
      };
    } catch {
      return {
        available: false,
        baseUrl: this.baseUrl,
      };
    }
  }
}

// Export singleton instance
export const bgeEmbeddingsClient = new BgeEmbeddingsClient();

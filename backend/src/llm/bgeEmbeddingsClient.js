import { pipeline } from '@huggingface/transformers';

const EMBEDDINGS_MODEL_ID = 'Xenova/multilingual-e5-large';

let embeddingsPipelinePromise = null;

async function getEmbeddingsPipeline() {
  if (!embeddingsPipelinePromise) {
    embeddingsPipelinePromise = pipeline('feature-extraction', EMBEDDINGS_MODEL_ID, {
      dtype: 'q4',
    });
  }
  return embeddingsPipelinePromise;
}

/**
 * Client for Qwen3-VL Embeddings microservice
 * Provides high-quality multilingual embeddings via Qwen3-VL-Embedding-8B
 */
export class BgeEmbeddingsClient {
  constructor(baseUrl = 'local://transformers-js/embeddings', timeout = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.dimensions = null;
  }

  /**
   * Check if the Qwen3-VL embeddings service is healthy
   */
  async healthCheck() {
    try {
      const start = Date.now();
      const pipe = await getEmbeddingsPipeline();
      if (!this.dimensions) {
        const output = await pipe('healthcheck', { pooling: 'mean', normalize: true });
        const list = output.tolist();
        if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0])) {
          this.dimensions = list[0].length;
        }
      }
      const elapsed = (Date.now() - start) / 1000;
      return {
        status: 'healthy',
        model_loaded: true,
        model_name: EMBEDDINGS_MODEL_ID,
        dimensions: this.dimensions,
        processing_time: elapsed,
      };
    } catch (error) {
      throw new Error(`Qwen3-VL embeddings service health check failed: ${error.message}`);
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
      const start = Date.now();
      const pipe = await getEmbeddingsPipeline();
      const output = await pipe(texts, { pooling: 'mean', normalize });
      const list = output.tolist();
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('No embeddings returned from transformers.js pipeline');
      }
      const dims = Array.isArray(list[0]) ? list[0].length : 0;
      this.dimensions = dims || this.dimensions;
      const elapsed = (Date.now() - start) / 1000;
      return {
        embeddings: list,
        dimensions: this.dimensions,
        model: EMBEDDINGS_MODEL_ID,
        processing_time: elapsed,
      };
    } catch (error) {
      throw new Error(`Qwen3-VL embeddings request failed: ${error.message}`);
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

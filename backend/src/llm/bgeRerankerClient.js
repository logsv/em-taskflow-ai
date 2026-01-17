import { pipeline, cos_sim } from '@huggingface/transformers';

const RERANKER_MODEL_ID = 'Xenova/multilingual-e5-large';

let rerankerPipelinePromise = null;

async function getRerankerPipeline() {
  if (!rerankerPipelinePromise) {
    rerankerPipelinePromise = pipeline('feature-extraction', RERANKER_MODEL_ID, {
      dtype: 'q4',
    });
  }
  return rerankerPipelinePromise;
}

/**
 * Client for Qwen3-VL Embedding Reranker microservice
 * Provides high-quality embedding-based document reranking
 */
export class BgeRerankerClient {
  constructor(baseUrl = 'local://transformers-js/reranker', timeout = 60000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Check if the Qwen3-VL reranker service is healthy
   */
  async healthCheck() {
    try {
      const start = Date.now();
      await getRerankerPipeline();
      const elapsed = (Date.now() - start) / 1000;
      return {
        status: 'healthy',
        model_loaded: true,
        model_name: RERANKER_MODEL_ID,
        processing_time: elapsed,
      };
    } catch (error) {
      throw new Error(`Qwen3-VL reranker service health check failed: ${error.message}`);
    }
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerank(query, documents, topK = 8, returnScores = true) {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    if (!documents || documents.length === 0) {
      throw new Error('No documents provided for reranking');
    }

    if (documents.length > 100) {
      throw new Error('Too many documents (max 100 per request)');
    }

    try {
      const start = Date.now();
      const pipe = await getRerankerPipeline();
      const contents = documents.map((doc) => {
        if (typeof doc === 'string') {
          return doc;
        }
        if (doc && typeof doc.content === 'string') {
          return doc.content;
        }
        return String(doc ?? '');
      });
      const docsOutput = await pipe(contents, { pooling: 'mean', normalize: true });
      const docsList = docsOutput.tolist();
      if (!Array.isArray(docsList) || docsList.length === 0) {
        throw new Error('No document embeddings returned from transformers.js pipeline');
      }
      const queryOutput = await pipe(query.trim(), { pooling: 'mean', normalize: true });
      const queryVector = queryOutput.data;
      const scored = docsList.map((embedding, index) => {
        const score = cos_sim(queryVector, embedding);
        const original = documents[index];
        const content = typeof original === 'string' ? original : original?.content ?? String(original ?? '');
        const metadata = typeof original === 'object' && original !== null && original.metadata ? original.metadata : {};
        return {
          content,
          metadata,
          score,
          index,
        };
      });
      scored.sort((a, b) => b.score - a.score);
      const limitedTopK = Math.min(topK, scored.length);
      const rerankedDocuments = scored.slice(0, limitedTopK).map((item) => ({
        content: item.content,
        metadata: item.metadata,
        score: returnScores ? item.score : undefined,
      }));
      const elapsed = (Date.now() - start) / 1000;
      return {
        reranked_documents: rerankedDocuments,
        model: RERANKER_MODEL_ID,
        processing_time: elapsed,
        original_count: documents.length,
        returned_count: rerankedDocuments.length,
      };
    } catch (error) {
      throw new Error(`Qwen3-VL reranking request failed: ${error.message}`);
    }
  }

  /**
   * Score query-document pairs directly (returns similarity scores)
   */
  async score(query, texts, returnRawScores = false) {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for scoring');
    }

    try {
      const pipe = await getRerankerPipeline();
      const queryOutput = await pipe(query.trim(), { pooling: 'mean', normalize: true });
      const queryVector = queryOutput.data;
      const textsOutput = await pipe(texts, { pooling: 'mean', normalize: true });
      const textsList = textsOutput.tolist();
      if (!Array.isArray(textsList) || textsList.length === 0) {
        throw new Error('No text embeddings returned from transformers.js pipeline');
      }
      const scores = textsList.map((embedding) => cos_sim(queryVector, embedding));
      if (returnRawScores) {
        return { scores };
      }
      const probabilities = scores.map((s) => 1 / (1 + Math.exp(-s)));
      return { probabilities };
    } catch (error) {
      throw new Error(`Qwen3-VL scoring request failed: ${error.message}`);
    }
  }

  /**
   * Rerank with automatic batching for large document sets
   */
  async batchRerank(query, documents, finalTopK = 8, batchSize = 50) {
    if (documents.length <= batchSize) {
      const result = await this.rerank(query, documents, finalTopK, true);
      return {
        reranked_documents: result.reranked_documents,
        total_processing_time: result.processing_time,
        batches_processed: 1,
        original_count: result.original_count,
      };
    }

    console.log(`🔄 Reranking ${documents.length} documents in batches of ${batchSize}`);
    
    const allRankedDocs = [];
    let totalProcessingTime = 0;
    let batchesProcessed = 0;

    // Process in batches, keeping top candidates from each batch
    const intermediateTopK = Math.min(batchSize, finalTopK * 2);

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      console.log(`   Reranking batch ${batchesProcessed + 1}/${Math.ceil(documents.length / batchSize)}...`);
      
      const result = await this.rerank(query, batch, intermediateTopK, true);
      allRankedDocs.push(...result.reranked_documents);
      totalProcessingTime += result.processing_time;
      batchesProcessed++;

      // Small delay between batches
      if (i + batchSize < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Final reranking of all intermediate results
    console.log(`   Final reranking of ${allRankedDocs.length} intermediate results...`);
    const finalResult = await this.rerank(query, allRankedDocs, finalTopK, true);
    totalProcessingTime += finalResult.processing_time;

    console.log(`✅ Completed batch reranking in ${totalProcessingTime.toFixed(3)}s`);

    return {
      reranked_documents: finalResult.reranked_documents,
      total_processing_time: totalProcessingTime,
      batches_processed: batchesProcessed + 1,
      original_count: documents.length,
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
export const bgeRerankerClient = new BgeRerankerClient();

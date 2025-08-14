import axios from 'axios';

export interface RerankDocument {
  content: string;
  metadata?: Record<string, any>;
  score?: number;
}

export interface RerankRequest {
  query: string;
  documents: RerankDocument[];
  top_k?: number;
  return_scores?: boolean;
}

export interface RerankResponse {
  reranked_documents: RerankDocument[];
  model: string;
  processing_time: number;
  original_count: number;
  returned_count: number;
}

export interface RerankHealthResponse {
  status: string;
  model_loaded: boolean;
  model_name: string;
}

/**
 * Client for BGE-Reranker-v2-M3 microservice
 * Provides high-quality cross-encoder document reranking
 */
export class BgeRerankerClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = 'http://localhost:8002', timeout: number = 60000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Check if the BGE-Reranker service is healthy
   */
  async healthCheck(): Promise<RerankHealthResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      throw new Error(`BGE reranker service health check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    topK: number = 8,
    returnScores: boolean = true
  ): Promise<RerankResponse> {
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
      const request: RerankRequest = {
        query: query.trim(),
        documents,
        top_k: topK,
        return_scores: returnScores,
      };

      const response = await axios.post(`${this.baseUrl}/rerank`, request, {
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
        throw new Error(`BGE reranking failed (${status}): ${message}`);
      }
      throw new Error(`BGE reranking request failed: ${(error as Error).message}`);
    }
  }

  /**
   * Score query-document pairs directly (returns similarity scores)
   */
  async score(
    query: string,
    texts: string[],
    returnRawScores: boolean = false
  ): Promise<{ scores?: number[]; probabilities?: number[] }> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for scoring');
    }

    try {
      const response = await axios.post(`${this.baseUrl}/score`, null, {
        params: {
          query: query.trim(),
          return_raw_scores: returnRawScores,
        },
        data: {
          query: query.trim(),
          texts,
          return_raw_scores: returnRawScores,
        },
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
        throw new Error(`BGE scoring failed (${status}): ${message}`);
      }
      throw new Error(`BGE scoring request failed: ${(error as Error).message}`);
    }
  }

  /**
   * Rerank with automatic batching for large document sets
   */
  async batchRerank(
    query: string,
    documents: RerankDocument[],
    finalTopK: number = 8,
    batchSize: number = 50
  ): Promise<{
    reranked_documents: RerankDocument[];
    total_processing_time: number;
    batches_processed: number;
    original_count: number;
  }> {
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
    
    const allRankedDocs: RerankDocument[] = [];
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
  async isAvailable(): Promise<boolean> {
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
  async getInfo(): Promise<{
    available: boolean;
    model?: string;
    baseUrl: string;
  }> {
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
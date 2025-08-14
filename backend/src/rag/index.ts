/**
 * RAG module - Document ingestion and retrieval
 * Centralized access to all RAG functionality
 */

// Re-export ingest functionality
export {
  initializeIngest,
  ingestPDF,
  getIngestStatus,
  getVectorStore,
  getChromaClient,
  clearCollection,
} from './ingest.js';

// Re-export retrieval functionality
export {
  agenticRetrieve,
  simpleRetrieve,
  getRetrieverStatus,
  type RetrievalResult,
  type RetrievalOptions,
} from './retriever.js';

// Combined RAG service for backward compatibility
import { initializeIngest, ingestPDF, getIngestStatus } from './ingest.js';
import { agenticRetrieve, simpleRetrieve, getRetrieverStatus } from './retriever.js';

/**
 * Legacy RAG service interface for backward compatibility
 */
export class RAGService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await initializeIngest();
    this.initialized = true;
  }

  async processPDF(filePath: string, filename: string) {
    await this.ensureInitialized();
    return ingestPDF(filePath, filename);
  }

  async searchRelevantChunks(query: string, topK = 5) {
    await this.ensureInitialized();
    return simpleRetrieve(query, topK);
  }

  async agenticRetrieve(query: string, options = {}) {
    await this.ensureInitialized();
    return agenticRetrieve(query, options);
  }

  async getStatus() {
    const ingestStatus = await getIngestStatus();
    const retrieverStatus = await getRetrieverStatus();
    
    return {
      ready: ingestStatus.initialized && ingestStatus.vectorStore,
      ...ingestStatus,
      ...retrieverStatus,
    };
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance for backward compatibility
const ragService = new RAGService();
export default ragService;
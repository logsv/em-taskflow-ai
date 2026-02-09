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
  baselineRetrieve,
  agenticRetrieve,
  simpleRetrieve,
  getRetrieverStatus,
} from './retriever.js';

// Combined RAG service for backward compatibility
import { initializeIngest, ingestPDF, getIngestStatus, getVectorStore } from './ingest.js';
import { baselineRetrieve, agenticRetrieve, simpleRetrieve, getRetrieverStatus } from './retriever.js';

/**
 * Legacy RAG service interface for backward compatibility
 */
export class RAGService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    const existingVectorStore = getVectorStore();
    if (!existingVectorStore) {
      await initializeIngest();
    }
    this.initialized = true;
  }

  async processPDF(filePath, filename) {
    await this.ensureInitialized();
    return ingestPDF(filePath, filename);
  }

  async searchRelevantChunks(query, topK = 5) {
    await this.ensureInitialized();
    return simpleRetrieve(query, topK);
  }

  async baselineRetrieve(query, options = {}) {
    await this.ensureInitialized();
    return baselineRetrieve(query, options);
  }

  async agenticRetrieve(query, options = {}) {
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

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance for backward compatibility
const ragService = new RAGService();
export default ragService;

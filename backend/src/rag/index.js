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
import databaseService from '../db/postgres.js';

/**
 * Legacy RAG service interface for backward compatibility
 */
export class RAGService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    await initializeIngest();
    this.initialized = true;
  }

  async processPDF(filePath, filename) {
    await this.ensureInitialized();
    return ingestPDF(filePath, filename);
  }

  async listDocuments() {
    await this.ensureInitialized();
    try {
      return await databaseService.listPdfDocuments();
    } catch (error) {
      return [];
    }
  }

  async getDocument(documentId) {
    const docs = await this.listDocuments();
    return docs.find((doc) => doc.id === documentId) || null;
  }

  async queryDocument(documentId, query, options = {}) {
    await this.ensureInitialized();
    const ragMode = options.mode === 'advanced' ? 'advanced' : 'baseline';
    const topK = options.topK || 6;
    const metadataFilter = { filename: documentId };

    if (ragMode === 'advanced') {
      return agenticRetrieve(query, { topK, metadataFilter });
    }
    return baselineRetrieve(query, { topK, metadataFilter });
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

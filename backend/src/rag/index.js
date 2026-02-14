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
import { getChromaClient } from './ingest.js';
import { getRagConfig } from '../config.js';

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

  async listDocuments() {
    await this.ensureInitialized();
    const ingestStatus = await getIngestStatus();
    const collection = ingestStatus.collectionInfo || null;
    if (!collection) {
      return [];
    }

    try {
      const client = getChromaClient();
      const ragConfig = getRagConfig();
      if (!client) {
        return [];
      }
      const col = await client.getCollection({ name: ragConfig.defaultCollection || 'pdf_chunks' });
      const result = await col.get({
        include: ['metadatas'],
      });

      const byFilename = new Map();
      const ids = Array.isArray(result.ids) ? result.ids : [];
      const metadatas = Array.isArray(result.metadatas) ? result.metadatas : [];
      for (let i = 0; i < ids.length; i += 1) {
        const metadata = metadatas[i] || {};
        const filename = metadata.filename || 'unknown.pdf';
        if (!byFilename.has(filename)) {
          byFilename.set(filename, {
            id: filename,
            filename,
            source: metadata.source || null,
            chunkCount: 0,
            lastUpdated: metadata.timestamp || null,
          });
        }
        const existing = byFilename.get(filename);
        existing.chunkCount += 1;
        if (metadata.timestamp && (!existing.lastUpdated || metadata.timestamp > existing.lastUpdated)) {
          existing.lastUpdated = metadata.timestamp;
        }
      }

      return Array.from(byFilename.values()).sort((a, b) => b.chunkCount - a.chunkCount);
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

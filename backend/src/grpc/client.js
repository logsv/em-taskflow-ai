/**
 * Python AI Microservice Client (gRPC + HTTP REST Fallback)
 * Provides type-safe calls for Document Extraction, 512-Token Chunking, PostgreSQL RAG Search, and Document CRUD.
 */

import axios from 'axios';
import config from '../config.js';
import { warn, debug } from '../utils/logger.js';

const PYTHON_AI_REST_URL = process.env.PYTHON_AI_SERVICE_URL || 'http://localhost:8000';

class PythonAIServiceClient {
  constructor() {
    this.baseUrl = PYTHON_AI_REST_URL;
  }

  /**
   * Fast-path document and image text extraction (<1.5s)
   */
  async extractDocument(fileBuffer, filename, mimeType = '') {
    try {
      const FormDataModule = (await import('form-data')).default;
      const formData = new FormDataModule();
      formData.append('file', fileBuffer, { filename, contentType: mimeType || 'application/octet-stream' });

      const response = await axios.post(`${this.baseUrl}/api/v1/extract`, formData, {
        headers: formData.getHeaders(),
        timeout: 10000,
      });

      if (response.data && response.data.success) {
        return response.data;
      }
      return {
        success: false,
        filename,
        extracted_text: '',
        page_count: 0,
        extraction_method: 'error',
        error_message: response.data?.error_message || 'Extraction failed',
      };
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'extractDocumentFallback', filename, err: error }, `Python AI Service extraction fallback for ${filename}`);
      try {
        const text = fileBuffer.toString('utf-8');
        return {
          success: true,
          filename,
          extracted_text: text,
          page_count: 1,
          extraction_method: 'node_fallback',
          error_message: '',
        };
      } catch (err) {
        return {
          success: false,
          filename,
          extracted_text: '',
          page_count: 0,
          extraction_method: 'failed',
          error_message: error.message,
        };
      }
    }
  }

  /**
   * Process document into token-aware 512-token chunks & persist in Python Postgres DB
   */
  async processRAGIngestion(text, filename) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/v1/rag/chunk`, {
        filename,
        text,
      }, { timeout: 10000 });

      if (response.data && Array.isArray(response.data.chunks)) {
        return {
          success: true,
          filename,
          chunks: response.data.chunks,
          total_chunks: response.data.total_chunks,
        };
      }
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'processRAGIngestionFallback', filename, err: error }, `Python AI Service chunking fallback for ${filename}`);
    }

    return null;
  }

  /**
   * Search RAG: Hybrid Search (tsvector + vector similarity) & Cross-Encoder Reranking in Python
   */
  async searchRAG(query, topK = 5, filterFilename = '') {
    try {
      const response = await axios.post(`${this.baseUrl}/api/v1/rag/search`, {
        query,
        top_k: topK,
        filter_filename: filterFilename,
      }, { timeout: 30000 });

      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results.map((r) => ({
          pageContent: r.content,
          metadata: {
            id: r.id,
            filename: r.filename,
            chunkIndex: r.chunk_index,
            parentContent: r.parent_content,
            score: r.score,
          },
        }));
      }
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'searchRAGFallback', query, err: error }, `Python AI Service searchRAG fallback for query`);
    }
    return [];
  }

  /**
   * List distinct ingested documents from Python Postgres DB
   */
  async listDocuments() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/rag/documents`, { timeout: 5000 });
      if (response.data && Array.isArray(response.data.documents)) {
        return response.data.documents;
      }
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'listDocumentsFallback', err: error }, 'Python AI Service listDocuments fallback');
    }
    return [];
  }

  /**
   * Get all extracted chunks for a specific document from Python AI Service
   */
  async getDocumentChunks(filename) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/rag/documents/${encodeURIComponent(filename)}/chunks`,
        { timeout: 8000 }
      );
      if (response.data && Array.isArray(response.data.chunks)) {
        return response.data.chunks.map((r) => ({
          pageContent: r.content,
          metadata: {
            id: r.id,
            filename: r.filename,
            chunkIndex: r.chunk_index,
            parentContent: r.parent_content,
            score: r.score || 1.0,
          },
        }));
      }
    } catch (error) {
      // Fall back to searchRAG
    }
    return this.searchRAG('', 100, filename);
  }

  /**
   * Delete document and chunks from Python Postgres DB
   */
  async deleteDocument(filename) {
    try {
      const response = await axios.delete(`${this.baseUrl}/api/v1/rag/documents/${encodeURIComponent(filename)}`, { timeout: 5000 });
      if (response.data && response.data.filename) {
        return response.data;
      }
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'deleteDocumentFallback', filename, err: error }, `Python AI Service deleteDocument fallback for ${filename}`);
    }
    return { success: false, filename, deleted_chunks: 0 };
  }

  /**
   * Cross-Encoder Reranking to eliminate hallucinations
   */
  async rerankChunks(query, candidateChunks, topN = 5) {
    if (!Array.isArray(candidateChunks) || candidateChunks.length === 0) {
      return candidateChunks || [];
    }

    try {
      const payload = {
        query,
        candidate_chunks: candidateChunks.map((c, i) => ({
          id: c.id || `chunk_${i}`,
          content: c.pageContent || c.content || '',
          filename: c.metadata?.filename || c.filename || '',
          chunk_index: c.metadata?.chunkIndex ?? c.chunkIndex ?? 0,
        })),
        top_n: topN,
      };

      const response = await axios.post(`${this.baseUrl}/api/v1/rag/rerank`, payload, { timeout: 30000 });
      
      if (response.data && Array.isArray(response.data.reranked_chunks) && response.data.reranked_chunks.length > 0) {
        const rerankedMap = new Map(response.data.reranked_chunks.map((r) => [r.id, r.rerank_score]));
        
        const rerankedDocs = candidateChunks
          .map((doc, i) => {
            const docId = doc.id || `chunk_${i}`;
            const score = rerankedMap.get(docId);
            if (score !== undefined) {
              return { doc, score };
            }
            return null;
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score)
          .map((item) => {
            item.doc.metadata = { ...item.doc.metadata, rerankScore: item.score };
            return item.doc;
          });

        if (rerankedDocs.length > 0) {
          return rerankedDocs.slice(0, topN);
        }
      }
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'rerankChunksFallback', err: error }, 'Cross-Encoder reranking fallback');
    }

    return candidateChunks.slice(0, topN);
  }
}

const pythonAIServiceClient = new PythonAIServiceClient();
export default pythonAIServiceClient;

/**
 * Python AI microservice client (HTTP REST)
 * Provides type-safe calls for Document Extraction, 512-Token Chunking, PostgreSQL RAG Search, and Document CRUD.
 */

import axios from 'axios';
import config from '../config.js';
import { z } from 'zod';
import { warn, debug, error as logError } from '../utils/logger.js';
import { incCounter } from '../core/metrics.js';

/** Response shapes of the Python AI service (see services/python-ai-service/app/api/rest_router.py). */
const SearchResponseSchema = z.object({
  results: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    content: z.string(),
    filename: z.string(),
    chunk_index: z.number().int().nullable().optional(),
    parent_content: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
  }).passthrough()),
}).passthrough();

const RerankResponseSchema = z.object({
  reranked_chunks: z.array(z.object({ id: z.union([z.string(), z.number()]), rerank_score: z.number() }).passthrough()),
}).passthrough();

const DocumentsResponseSchema = z.object({
  documents: z.array(z.object({ filename: z.string() }).passthrough()),
}).passthrough();

/** Parse a Python response; on a contract mismatch, log + count it and return null. */
function validateResponse(endpoint, schema, data) {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  incCounter('python_contract_violation_total', { endpoint }, 1, 'Python AI service responses that did not match the expected schema');
  logError({ module: 'pythonAIServiceClient', action: 'contractViolation', endpoint, issues: parsed.error.issues.slice(0, 3) }, `Python AI service response for ${endpoint} did not match the expected schema`);
  return null;
}

/** File types that are safe to read as UTF-8 text when the Python extractor is unavailable. */
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|ya?ml|log)$/i;

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
      incCounter('python_service_fallback_total', { endpoint: 'extract' }, 1, 'Python AI service calls that fell back');
      // Only plain-text formats can be read without the extractor. Decoding a PDF/DOCX/image as
      // UTF-8 produced garbage that was passed to the model as "extracted text".
      if (!TEXT_EXTENSIONS.test(filename) && !/^text\//.test(mimeType || '')) {
        return {
          success: false,
          filename,
          extracted_text: '',
          page_count: 0,
          extraction_method: 'unavailable',
          error_message: 'The document extraction service is unavailable, so this file type cannot be read right now.',
        };
      }
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
      incCounter('python_service_fallback_total', { endpoint: 'processRAGIngestion' }, 1, 'Python AI service calls that fell back');
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

      const data = validateResponse('rag/search', SearchResponseSchema, response.data);
      if (data) {
        return data.results.map((r) => ({
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
      incCounter('python_service_fallback_total', { endpoint: 'searchRAG' }, 1, 'Python AI service calls that fell back');
    }
    return [];
  }

  /**
   * List distinct ingested documents from Python Postgres DB
   */
  async listDocuments() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/rag/documents`, { timeout: 5000 });
      const data = validateResponse('rag/documents', DocumentsResponseSchema, response.data);
      if (data) {
        return data.documents;
      }
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'listDocumentsFallback', err: error }, 'Python AI Service listDocuments fallback');
      incCounter('python_service_fallback_total', { endpoint: 'listDocuments' }, 1, 'Python AI service calls that fell back');
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
            score: typeof r.score === 'number' ? r.score : null,
          },
        }));
      }
    } catch (error) {
      warn({ module: 'pythonAIServiceClient', action: 'getDocumentChunksFallback', filename, err: error }, 'getDocumentChunks failed, falling back to filtered search');
      incCounter('python_service_fallback_total', { endpoint: 'document_chunks' }, 1, 'Python AI service calls that fell back');
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
      incCounter('python_service_fallback_total', { endpoint: 'deleteDocument' }, 1, 'Python AI service calls that fell back');
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
      
      const data = validateResponse('rag/rerank', RerankResponseSchema, response.data);
      if (data && data.reranked_chunks.length > 0) {
        const rerankedMap = new Map(data.reranked_chunks.map((r) => [r.id, r.rerank_score]));
        
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
      incCounter('python_service_fallback_total', { endpoint: 'rerankChunks' }, 1, 'Python AI service calls that fell back');
    }

    return candidateChunks.slice(0, topN);
  }
}

const pythonAIServiceClient = new PythonAIServiceClient();
export default pythonAIServiceClient;

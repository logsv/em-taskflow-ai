/**
 * RAG Ingest module - PDF processing and chunking pipeline
 * Handles document ingestion with token-aware chunking and vector storage
 */

import { TokenTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import fs from 'fs/promises';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { config, getRagConfig } from '../config.js';
import { BGEEmbeddingsAdapter } from '../llm/bgeEmbeddingsAdapter.js';
import databaseService from '../db/postgres.js';
import pythonAIServiceClient from '../grpc/client.js';
import { info, warn, error, debug } from '../utils/logger.js';

// Dependencies for injection
let fsModule = fs;
let pdfModule = pdf;

// Chunking configuration (Industry standard 512 tokens with 64 token overlap)
const CHUNK_SIZE = 512; // tokens
const CHUNK_OVERLAP = 64; // tokens

// Singleton instances
let vectorStore = null;
let initialized = false;

/**
 * Initialize the ingestion pipeline
 */
export async function initializeIngest() {
  if (initialized) return;

  info({ module: 'ragIngest', action: 'initializeIngest' }, 'Initializing RAG ingest pipeline (PostgreSQL Store)');
  
  const ragConfig = getRagConfig();
  if (!ragConfig.enabled) {
    warn({ module: 'ragIngest', action: 'initializeIngest' }, 'RAG is disabled in configuration');
    return;
  }

  try {
    let embeddings;
    const provider = (ragConfig.embeddingProvider || 'qwen3-vl').toLowerCase();

    if (provider === 'qwen3-vl' || provider === 'bge-m3' || provider === 'microservice' || provider === 'auto') {
      try {
        const bgeAdapter = new BGEEmbeddingsAdapter();
        const bgeAvailable = await bgeAdapter.isAvailable();
        if (bgeAvailable) {
          info({ module: 'ragIngest', action: 'initializeIngest', provider: 'qwen3-vl' }, 'Using Qwen3-VL embeddings microservice for ingestion');
          embeddings = bgeAdapter;
        }
      } catch (err) {
        warn({ module: 'ragIngest', action: 'embeddingsMicroserviceFallback', err }, 'Embeddings microservice not available, using fallback embedding builder');
      }
    }

    if (!embeddings) {
      embeddings = {
        embedDocuments: async (texts) => {
          return texts.map(() => new Array(1536).fill(0));
        },
        embedQuery: async () => {
          return new Array(1536).fill(0);
        },
      };
    }

    vectorStore = {
      addDocuments: async (documents) => {
        const dbChunks = documents.map((doc, idx) => ({
          document_id: doc.metadata?.filename || 'unknown.pdf',
          chunk_index: doc.metadata?.chunkIndex !== undefined ? doc.metadata.chunkIndex : idx,
          content: doc.pageContent,
          metadata: doc.metadata || {},
          embedding: null,
        }));
        await databaseService.upsertPdfChunks(dbChunks);
      },
    };

    initialized = true;
    info({ module: 'ragIngest', action: 'initializeIngestSuccess' }, 'RAG ingest pipeline initialized (PostgreSQL)');
  } catch (err) {
    error({ module: 'ragIngest', action: 'initializeIngestError', err }, 'Failed to initialize RAG ingest pipeline');
    throw err;
  }
}

/**
 * Process PDF file into chunks and store in vector database
 */
export async function ingestPDF(filePath, filename) {
  await ensureIngestReady();

  const startTime = Date.now();
  try {
    info(`PDF ingestion started`, { filename });

    // Read file buffer
    const dataBuffer = await fsModule.readFile(filePath);
    
    // Try Python AI Microservice extraction (PDF, CSV, Word, Images, Text)
    let text = '';
    const pyExtract = await pythonAIServiceClient.extractDocument(dataBuffer, filename, '');
    if (pyExtract && pyExtract.success && pyExtract.extracted_text) {
      text = pyExtract.extracted_text;
      info(`Document extracted via Python AI service`, { filename, charCount: text.length, method: pyExtract.extraction_method });
    } else if (filename.toLowerCase().endsWith('.pdf')) {
      // Fallback to JS pdf-parse module for PDFs only
      try {
        const pdfData = await pdfModule(dataBuffer);
        text = pdfData ? pdfData.text : '';
      } catch (err) {
        text = '';
      }
    } else {
      // Plain text fallback
      text = dataBuffer.toString('utf-8');
    }

    if (!text || text.trim().length === 0) {
      throw new Error(filename.toLowerCase().endsWith('.pdf') ? 'No text content found in PDF' : 'No text content found in document');
    }

    // Create chunks with token-aware splitting
    let chunks = [];
    
    // Try Python AI Microservice 512-token chunking
    const pyChunksRes = await pythonAIServiceClient.processRAGIngestion(text, filename);
    if (pyChunksRes && pyChunksRes.success && Array.isArray(pyChunksRes.chunks) && pyChunksRes.chunks.length > 0) {
      chunks = pyChunksRes.chunks.map((item, idx) => new Document({
        pageContent: item.content,
        metadata: {
          filename,
          source: filePath,
          chunkIndex: idx,
          parentContent: item.parent_content,
          tokenCount: item.token_count,
        },
      }));
      info(`Chunks created via Python AI service`, { filename, chunksCount: chunks.length });
    } else {
      try {
        chunks = await createChunks(text, filename, filePath);
      } catch (chunkError) {
        warn('Token-aware chunking failed, using character-split fallback chunks', { filename, err: chunkError.message });
        chunks = createFallbackChunks(text, filename, filePath);
      }
    }
    
    if (chunks.length === 0) {
      throw new Error('No valid chunks created from PDF');
    }

    // Store chunks in PostgreSQL database (parent-child chunking)
    try {
      const dbChunks = chunks.map((doc, idx) => {
        const childText = doc.pageContent;
        // Windowed parent context combines adjacent chunks (~1000 tokens max) instead of whole document
        const prevText = chunks[idx - 1] ? chunks[idx - 1].pageContent : '';
        const nextText = chunks[idx + 1] ? chunks[idx + 1].pageContent : '';
        const windowedParent = [prevText, childText, nextText].filter(Boolean).join('\n---\n');
        const parentText = doc.metadata?.parentContent || windowedParent;
        const header = `[Document: ${filename}]\n`;
        
        return {
          id: `${filenameSafeId(filename)}_${idx}`,
          documentId: filename,
          filename,
          chunkIndex: idx,
          content: `${header}${childText}`,
          parentContent: `${header}${parentText}`,
          embedding: null, // Computed on demand or stored
        };
      });

      await databaseService.upsertPdfChunks(dbChunks);
      info(`Parent-child chunks saved to PostgreSQL DB`, { filename, chunksCount: dbChunks.length });
    } catch (dbErr) {
      warn(`PostgreSQL pdf_chunks upsert failed, falling back to ChromaDB only`, { filename, err: dbErr.message });
    }

    // Store chunks in vector database
    if (vectorStore) {
      await vectorStore.addDocuments(chunks);
      info(`PDF ingestion completed successfully`, { filename, chunksCount: chunks.length, durationMs: Date.now() - startTime });
    }

    return {
      success: true,
      chunks: chunks.length,
    };

  } catch (err) {
    error('PDF ingestion failed', { filename, err: err.message });
    return {
      success: false,
      chunks: 0,
      error: err.message,
    };
  }
}

/**
 * Character-split fallback for creating standard 512-token (~2000 char) chunks
 */
function createFallbackChunks(text, filename, filePath) {
  const targetLength = 2000; // ~500 tokens
  const overlap = 250;
  const rawChunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + targetLength;
    if (endIndex < text.length) {
      const breakPoint = text.lastIndexOf('\n', endIndex);
      if (breakPoint > startIndex + 500) {
        endIndex = breakPoint;
      }
    }
    const chunkText = text.slice(startIndex, endIndex).trim();
    if (chunkText.length > 0) {
      rawChunks.push(chunkText);
    }
    startIndex += (targetLength - overlap);
  }

  return rawChunks.map((chunk, index) => new Document({
    pageContent: chunk,
    metadata: {
      filename,
      source: filePath,
      chunkIndex: index,
      chunkSize: chunk.length,
      tokenCount: estimateTokens(chunk),
      processingMethod: 'character_fallback',
      timestamp: new Date().toISOString(),
      documentType: 'pdf',
      chunkType: classifyChunkType(chunk),
      contentHash: simpleHash(chunk),
    },
  }));
}

/**
 * Create chunks from text using token-aware splitting
 */
async function createChunks(text, filename, filePath) {
  debug({ module: 'ragIngest', action: 'createChunks', filename }, 'Creating token-aware chunks');

  // Use TokenTextSplitter for precise token control
  const tokenSplitter = new TokenTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  // Use token splitter for most precise control
  const chunks = await tokenSplitter.splitText(text);
  
  // Create documents with enhanced metadata
  const documents = chunks.map((chunk, index) => new Document({
    pageContent: chunk,
    metadata: {
      filename,
      source: filePath,
      chunkIndex: index,
      chunkSize: chunk.length,
      tokenCount: estimateTokens(chunk),
      processingMethod: 'token_aware_recursive',
      timestamp: new Date().toISOString(),
      documentType: 'pdf',
      chunkType: classifyChunkType(chunk),
      // Add hash for deduplication
      contentHash: simpleHash(chunk),
    }
  }));

  debug({ module: 'ragIngest', action: 'createChunksComplete', filename, chunkCount: documents.length }, `Created ${documents.length} chunks`);
  return documents;
}

/**
 * Classify chunk type for better retrieval
 */
function classifyChunkType(chunk) {
  const text = chunk.toLowerCase();
  
  if (text.includes('table') || text.includes('figure') || text.includes('chart')) {
    return 'structured';
  } else if (text.includes('conclusion') || text.includes('summary')) {
    return 'summary';
  } else if (text.includes('introduction') || text.includes('abstract')) {
    return 'introduction';
  } else if (text.match(/^\s*\d+\.\s/m)) {
    return 'list';
  } else if (text.includes('method') || text.includes('approach')) {
    return 'methodology';
  } else {
    return 'content';
  }
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Simple hash function for content deduplication
 */
function simpleHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

function filenameSafeId(value) {
  return String(value || 'doc')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 48);
}

function sanitizeMetadata(metadata) {
  const output = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    } else {
      output[key] = JSON.stringify(value);
    }
  }
  return output;
}

/**
 * Get ingestion status
 */
export async function getIngestStatus() {
  let docCount = 0;
  try {
    const docs = await databaseService.listPdfDocuments();
    docCount = docs.reduce((acc, d) => acc + (d.chunkCount || 0), 0);
  } catch (e) {}

  return {
    initialized,
    vectorStore: !!vectorStore,
    collectionInfo: {
      name: 'pdf_chunks',
      count: docCount,
    },
  };
}

/**
 * Get vector store instance
 */
export function getVectorStore() {
  return vectorStore;
}

/**
 * Ensure ingest pipeline is ready
 */
async function ensureIngestReady() {
  if (!initialized && !vectorStore) {
    await initializeIngest();
  }
}

/**
 * Clear all documents from collection
 */
export async function clearCollection() {
  try {
    await databaseService.pool.query('TRUNCATE TABLE pdf_chunks');
    info({ module: 'ragIngest', action: 'clearCollection' }, 'Cleared PostgreSQL pdf_chunks table');
    initialized = false;
    vectorStore = null;
    await initializeIngest();
  } catch (err) {
    error({ module: 'ragIngest', action: 'clearCollectionError', err }, 'Failed to clear pdf_chunks');
    throw err;
  }
}

// Test hooks
export const __test__ = {
  setFs: (mock) => { fsModule = mock; },
  setPdf: (mock) => { pdfModule = mock; },
  setInitialized: (val) => { initialized = val; },
  setVectorStore: (mock) => { vectorStore = mock; },
  getVectorStore: () => vectorStore,
};

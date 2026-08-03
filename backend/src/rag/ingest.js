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

// Dependencies for injection
let fsModule = fs;
let pdfModule = pdf;

// Chunking configuration
const CHUNK_SIZE = 800; // tokens
const CHUNK_OVERLAP = 150; // tokens

// Singleton instances
let vectorStore = null;
let initialized = false;

/**
 * Initialize the ingestion pipeline
 */
export async function initializeIngest() {
  if (initialized) return;

  console.log('📥 Initializing RAG ingest pipeline (PostgreSQL Store)...');
  
  const ragConfig = getRagConfig();
  if (!ragConfig.enabled) {
    console.log('⚠️ RAG is disabled in configuration');
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
          console.log('✅ Using Qwen3-VL embeddings microservice for ingestion');
          embeddings = bgeAdapter;
        }
      } catch (error) {
        console.warn('⚠️ Embeddings microservice not available, using fallback embedding builder');
      }
    }

    if (!embeddings) {
      embeddings = {
        embedQuery: async (text) => {
          const dim = 768;
          const result = new Array(dim);
          for (let i = 0; i < dim; i += 1) {
            const code = text.charCodeAt(i % text.length) || 0;
            result[i] = Math.sin(code + i) * 0.01;
          }
          return result;
        },
        embedDocuments: async (docs) => {
          const results = [];
          for (const doc of docs) {
            results.push(await embeddings.embedQuery(doc));
          }
          return results;
        },
      };
    }

    vectorStore = {
      embeddings,
      async addDocuments(documents) {
        const dbChunks = documents.map((doc, idx) => ({
          id: `${filenameSafeId(doc.metadata?.filename || 'doc')}_${idx}`,
          documentId: doc.metadata?.filename || 'doc',
          filename: doc.metadata?.filename || 'doc.pdf',
          chunkIndex: idx,
          content: doc.pageContent,
          parentContent: doc.metadata?.parentContent || doc.pageContent,
          embedding: null,
        }));
        await databaseService.upsertPdfChunks(dbChunks);
      },
    };

    initialized = true;
    console.log('✅ RAG ingest pipeline initialized (PostgreSQL)');
  } catch (error) {
    console.error('❌ Failed to initialize RAG ingest pipeline:', error);
    throw error;
  }
}

/**
 * Process PDF file into chunks and store in vector database
 */
export async function ingestPDF(filePath, filename) {
  await ensureIngestReady();

  try {
    console.log(`📄 Ingesting PDF: ${filename}`);

    // Read and parse PDF
    const dataBuffer = await fsModule.readFile(filePath);
    const pdfData = await pdfModule(dataBuffer);
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      throw new Error('No text content found in PDF');
    }

    // Create chunks with token-aware splitting, with fallback if tokenization fails
    let chunks;
    try {
      chunks = await createChunks(text, filename, filePath);
    } catch (chunkError) {
      console.warn('⚠️ Chunking failed, using fallback document chunk:', chunkError);
      chunks = [
        new Document({
          pageContent: text,
          metadata: {
            filename,
            source: filePath,
            chunkIndex: 0,
          },
        }),
      ];
    }
    
    if (chunks.length === 0) {
      throw new Error('No valid chunks created from PDF');
    }

    // Store chunks in PostgreSQL database (parent-child chunking)
    try {
      const dbChunks = chunks.map((doc, idx) => {
        const childText = doc.pageContent;
        // Parent context combines surrounding text if available
        const parentText = doc.metadata?.parentContent || childText;
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
      console.log(`🗄️ Saved ${dbChunks.length} parent-child chunks into PostgreSQL DB for ${filename}`);
    } catch (dbErr) {
      console.warn(`⚠️ PostgreSQL pdf_chunks upsert failed (${dbErr.message}), falling back to ChromaDB only.`);
    }

    // Store chunks in vector database
    if (vectorStore) {
      await vectorStore.addDocuments(chunks);
      console.log(`✅ Ingested ${chunks.length} chunks from ${filename}`);
    }

    return {
      success: true,
      chunks: chunks.length,
    };

  } catch (error) {
    console.error('❌ PDF ingestion failed:', error);
    return {
      success: false,
      chunks: 0,
      error: error.message,
    };
  }
}

/**
 * Create chunks from text using token-aware splitting
 */
async function createChunks(text, filename, filePath) {
  console.log('🔪 Creating token-aware chunks...');

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

  console.log(`📋 Created ${documents.length} chunks (avg ${Math.round(text.length / documents.length)} chars per chunk)`);
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
    console.log('✅ Cleared PostgreSQL pdf_chunks table');
    initialized = false;
    vectorStore = null;
    await initializeIngest();
  } catch (error) {
    console.error('❌ Failed to clear pdf_chunks:', error);
    throw error;
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

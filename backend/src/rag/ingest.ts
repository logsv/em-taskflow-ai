/**
 * RAG Ingest module - PDF processing and chunking pipeline
 * Handles document ingestion with token-aware chunking and vector storage
 */

import { RecursiveCharacterTextSplitter, TokenTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import fs from 'fs/promises';
import pdf from 'pdf-parse';
import { ChromaClient } from 'chromadb';
import { config, getRagConfig } from '../config.js';
import { getOllamaEmbeddings, getBgeEmbeddings } from '../llm/index.js';
import { BGEEmbeddingsAdapter } from '../llm/bgeEmbeddingsAdapter.js';

// Chunking configuration
const CHUNK_SIZE = 800; // tokens
const CHUNK_OVERLAP = 150; // tokens
const VECTOR_DIMENSION = 768; // BGE-M3 dimension

// Singleton instances
let vectorStore: Chroma | null = null;
let chromaClient: ChromaClient | null = null;
let initialized = false;

/**
 * Initialize the ingestion pipeline
 */
export async function initializeIngest(): Promise<void> {
  if (initialized) return;

  console.log('📥 Initializing RAG ingest pipeline...');
  
  const ragConfig = getRagConfig();
  if (!ragConfig.enabled) {
    console.log('⚠️ RAG is disabled in configuration');
    return;
  }

  try {
    // Initialize ChromaDB client
    chromaClient = new ChromaClient({
      host: config.vectorDb?.chroma?.host || 'localhost',
      port: config.vectorDb?.chroma?.port || 8000,
    });

    // Initialize vector store with enhanced HNSW parameters
    const collectionName = ragConfig.defaultCollection || 'pdf_chunks';
    
    // Try BGE embeddings first, fallback to Ollama
    let embeddings;
    
    try {
      const bgeAdapter = new BGEEmbeddingsAdapter();
      const bgeAvailable = await bgeAdapter.isAvailable();
      if (bgeAvailable) {
        console.log('✅ Using BGE-M3 embeddings for ingestion');
        embeddings = bgeAdapter;
      } else {
        throw new Error('BGE not available');
      }
    } catch (error) {
      console.warn('⚠️ BGE-M3 not available, using Ollama embeddings');
      embeddings = getOllamaEmbeddings();
    }

    vectorStore = new Chroma(embeddings, {
      collectionName,
      url: `http://${config.vectorDb?.chroma?.host || 'localhost'}:${config.vectorDb?.chroma?.port || 8000}`,
      collectionMetadata: {
        'hnsw:space': 'cosine',
        'hnsw:construction_ef': 200,
        'hnsw:M': 16,
        'hnsw:search_ef': 100,
      },
    });

    initialized = true;
    console.log(`✅ RAG ingest pipeline initialized: ${collectionName}`);

  } catch (error) {
    console.error('❌ Failed to initialize RAG ingest pipeline:', error);
    throw error;
  }
}

/**
 * Process PDF file into chunks and store in vector database
 */
export async function ingestPDF(filePath: string, filename: string): Promise<{
  success: boolean;
  chunks: number;
  error?: string;
}> {
  await ensureIngestReady();

  try {
    console.log(`📄 Ingesting PDF: ${filename}`);

    // Read and parse PDF
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      throw new Error('No text content found in PDF');
    }

    // Create chunks with token-aware splitting
    const chunks = await createChunks(text, filename, filePath);
    
    if (chunks.length === 0) {
      throw new Error('No valid chunks created from PDF');
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
      error: (error as Error).message,
    };
  }
}

/**
 * Create chunks from text using token-aware splitting
 */
async function createChunks(text: string, filename: string, filePath: string): Promise<Document[]> {
  console.log('🔪 Creating token-aware chunks...');

  // Use TokenTextSplitter for precise token control
  const tokenSplitter = new TokenTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  // Alternative: RecursiveCharacterTextSplitter with better separators
  const recursiveSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE * 4, // Approximate character equivalent
    chunkOverlap: CHUNK_OVERLAP * 4,
    separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' ', ''],
    keepSeparator: true,
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
function classifyChunkType(chunk: string): string {
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
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Simple hash function for content deduplication
 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Get ingestion status
 */
export async function getIngestStatus(): Promise<{
  initialized: boolean;
  vectorStore: boolean;
  chromaClient: boolean;
  collectionInfo?: any;
}> {
  const status = {
    initialized,
    vectorStore: !!vectorStore,
    chromaClient: !!chromaClient,
  };

  // Get collection information if available
  if (chromaClient) {
    try {
      const ragConfig = getRagConfig();
      const collection = await chromaClient.getCollection({
        name: ragConfig.defaultCollection || 'pdf_chunks'
      });
      
      return {
        ...status,
        collectionInfo: {
          name: collection.name,
          count: await collection.count(),
          metadata: collection.metadata,
        },
      };
    } catch (error) {
      // Collection doesn't exist or other error
      return status;
    }
  }

  return status;
}

/**
 * Get vector store instance
 */
export function getVectorStore(): Chroma | null {
  return vectorStore;
}

/**
 * Get ChromaDB client
 */
export function getChromaClient(): ChromaClient | null {
  return chromaClient;
}

/**
 * Ensure ingest pipeline is ready
 */
async function ensureIngestReady(): Promise<void> {
  if (!initialized) {
    await initializeIngest();
  }
}

/**
 * Clear all documents from collection
 */
export async function clearCollection(): Promise<void> {
  if (!chromaClient) {
    throw new Error('ChromaDB client not initialized');
  }

  try {
    const ragConfig = getRagConfig();
    const collectionName = ragConfig.defaultCollection || 'pdf_chunks';
    
    // Delete and recreate collection
    try {
      await chromaClient.deleteCollection({ name: collectionName });
    } catch (error) {
      // Collection might not exist
    }
    
    console.log(`✅ Cleared collection: ${collectionName}`);
    
    // Reinitialize vector store
    await initializeIngest();
    
  } catch (error) {
    console.error('❌ Failed to clear collection:', error);
    throw error;
  }
}
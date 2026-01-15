// RAG (Retrieval-Augmented Generation) service for PDF processing and vector search
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import * as chromaService from './chromaService.js';
import { getRagConfig, getLlmConfig, getVectorDbConfig } from '../config.js';
import { getChatOllama, ensureLLMReady } from '../llm/index.js';

// Dynamic pdf-parse import with error handling
let pdfParse = null;

let loadPdfParse = async () => {
  if (pdfParse === null) {
    try {
      const pdfParseModule = await import('pdf-parse');
      pdfParse = pdfParseModule.default;
      console.log('✅ pdf-parse module loaded successfully');
    } catch (error) {
      console.warn('⚠️ pdf-parse module not available:', error);
      pdfParse = false; // Mark as failed to avoid retrying
    }
  }
  return pdfParse;
}

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RAGService {
  constructor(fsModule, chromaServiceModule, axiosModule) {
    this.ragConfig = getRagConfig();
    this.embeddingModel = this.ragConfig.embeddingModel;
    this.defaultCollection = this.ragConfig.defaultCollection;
    this.maxChunkSize = this.ragConfig.maxChunkSize;
    
    this.fs = fsModule;
    this.chromaService = chromaServiceModule;
    this.axios = axiosModule;
    const rawBase = getLlmConfig().providers.ollama.baseUrl;
    const normalizedBase = rawBase.includes('localhost') ? rawBase.replace('localhost', '127.0.0.1') : rawBase;
    this.ollamaBaseUrl = normalizedBase + '/api';
    // Ensure PDF storage directory exists
    this.pdfDir = path.join(__dirname, '../../data/pdfs/');
    if (!this.fs.existsSync(this.pdfDir)) {
      this.fs.mkdirSync(this.pdfDir, { recursive: true });
    }
  }

  setChromaService(service) {
    this.chromaService = service;
  }

  setFs(fsModule) {
    this.fs = fsModule;
  }

  setAxios(axiosInstance) {
    this.axios = axiosInstance;
  }

  /**
   * Process and store PDF document in vector database
   */
  async processPDF(filePath, originalName) {
    try {
      console.log('📄 Processing PDF:', originalName);
      
      // Load pdf-parse dynamically
      const pdfParseFunction = await loadPdfParse();
      if (!pdfParseFunction) {
        throw new Error('PDF parsing service not available');
      }
      
      // Read and parse PDF
      const dataBuffer = this.fs.readFileSync(filePath);
      const pdfData = await pdfParseFunction(dataBuffer);
      
      if (!pdfData.text || pdfData.text.trim().length === 0) {
        throw new Error('PDF contains no extractable text');
      }

      console.log(`📝 Extracted ${pdfData.text.length} characters from PDF`);

      // Create chunks from PDF text
      const chunks = this.createChunks(pdfData.text);

      console.log(`🔪 Created ${chunks.length} chunks`);

      // Store chunks in vector database
      const filename = path.basename(filePath) || 'unknown_file';
      await this.storeChunks(chunks, filename, originalName);

      return { success: true, chunks: chunks.length };
    } catch (error) {
      console.error('❌ PDF processing error:', error);
      return { 
        success: false, 
        chunks: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Create text chunks from PDF content
   */
  createChunks(text, maxChunkSize = this.maxChunkSize) {
    // Split by paragraphs first
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      
      // If adding this paragraph would exceed chunk size, save current chunk
      if (currentChunk.length > 0 && (currentChunk + '\n\n' + trimmedPara).length > maxChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedPara;
      } else {
        currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + trimmedPara;
      }
    }

    // Add final chunk if not empty
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Ensure collection exists using Python Chroma client
   */
  async ensureCollection() {
    try {
      const metadata = {
        description: 'PDF document chunks for RAG search'
      };
      
      const result = await this.chromaService.createCollection(this.defaultCollection, metadata);
      
      if (result.success) {
        console.log(`✅ ${result.message}`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ Error ensuring collection:', error);
      throw error;
    }
  }

  /**
   * Store text chunks in vector database with embeddings
   */
  async storeChunks(chunks, filename, originalName) {
    console.log(`💾 Storing ${chunks.length} chunks in vector database`);

    // Ensure collection exists
    await this.ensureCollection();

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      if (!text || text.trim().length === 0) {
        console.warn(`⚠️ Skipping empty chunk ${i}`);
        continue;
      }
      
      const chunkId = `${filename}_${i}`;

      try {
        // Generate embedding
        const embedding = await this.generateEmbedding(text);
        
        // Store in Chroma using Python script
        const result = await this.chromaService.addDocuments(
          this.defaultCollection,
          [text],
          [{
            filename: originalName,
            chunk_index: i,
            text: text && text.length > 200 ? text.substring(0, 200) + '...' : text || '' // Store preview in metadata
          }],
          [chunkId],
          [embedding]
        );
        
        if (!result.success) {
          throw new Error(result.error);
        }

        console.log(`✅ Stored chunk ${i + 1}/${chunks.length}`);
      } catch (error) {
        console.error(`❌ Failed to store chunk ${i}:`, error);
        throw error;
      }
    }
  }

  /**
   * Generate embedding for text using Ollama
   */
  async generateEmbedding(text) {
    try {
      const response = await this.axios.post(`${this.ollamaBaseUrl}/embeddings`, {
        model: this.embeddingModel,
        prompt: text
      }, {
        timeout: 30000 // 30 second timeout for embeddings
      });
      
      if (!response.data.embedding || !Array.isArray(response.data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }
      
      return response.data.embedding;
    } catch (error) {
      const msg = (error && error.message) ? error.message : String(error);
      console.error('❌ Embedding generation failed:', msg);
      // Return a small random vector to avoid total failure; this ensures RAG doesn’t block answers
      // and lets fallback LLM respond. Use deterministic length (e.g., 384) to match typical embedding dims.
      const dim = 768; // match typical nomic-embed-text dimension and existing collection
      const pseudoEmbedding = Array.from({ length: dim }, (_, i) => Math.sin(i) * 0.01);
      return pseudoEmbedding;
    }
  }

  /**
   * Use LLM to create a database query from user query
   */
  async createDbQueryFromUserQuery(userQuery) {
    try {
      await ensureLLMReady();
      const llm = getChatOllama();
      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          'You convert user questions into focused search queries for a document database. Return only valid JSON in the form {"search_query": "..."} with no extra text.',
        ],
        ['human', '{input}'],
      ]);
      const formatted = await prompt.format({ input: userQuery });
      const response = await llm.invoke(formatted);
      const content = response.content ? response.content.toString() : '';
      let searchQuery = userQuery;
      if (content && content.trim().length > 0) {
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed.search_query === 'string' && parsed.search_query.trim().length > 0) {
            searchQuery = parsed.search_query.trim();
          }
        } catch (parseError) {
          console.warn('⚠️ Failed to parse LLM DB query JSON, using original query:', parseError);
        }
      }
      console.log(`🧠 LLM DB query generated: "${searchQuery}"`);
      return { searchQuery };
    } catch (error) {
      console.warn('⚠️ Failed to create DB query with LLM, using original query:', error);
      return { searchQuery: userQuery };
    }
  }

  /**
   * Search for relevant chunks based on query
   */
  async searchRelevantChunks(query, topK = 5) {
    try {
      const { searchQuery } = await this.createDbQueryFromUserQuery(query);
      const effectiveQuery = searchQuery || query;
      console.log(`🔍 Searching for relevant chunks with DB query: "${effectiveQuery}"`);

      const queryEmbedding = await this.generateEmbedding(effectiveQuery);

      // Search in Chroma using Python script
      const response = await this.chromaService.queryCollection(
        this.defaultCollection,
        [queryEmbedding],
        topK
      );
      
      if (!response.success) {
        throw new Error(response.error);
      }
      
      const results = response.results;
      const documents = results.documents?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      // Create structured results
      const chunks = documents.map((doc, i) => ({
        id: `chunk_${i}`,
        text: doc,
        metadata: metadatas[i] || {}
      }));

      // Create context for LLM
      const context = chunks
        .map((chunk, i) => `Source [${i + 1}] (${chunk.metadata.filename}):\n${chunk.text}`)
        .join('\n\n---\n\n');

      console.log(`✅ Found ${chunks.length} relevant chunks`);

      return {
        chunks,
        context,
        sources: metadatas
      };
    } catch (error) {
      console.error('❌ RAG search failed:', error);
      return {
        chunks: [],
        context: '',
        sources: []
      };
    }
  }

  /**
   * Check if vector database is available
   */
  async isVectorDBAvailable() {
    try {
      // Use v2 API heartbeat endpoint with configured host and port
      const vectorDbConfig = getVectorDbConfig();
      const chromaUrl = `http://${vectorDbConfig.chroma.host}:${vectorDbConfig.chroma.port}/api/v2/heartbeat`;
      const response = await this.axios.get(chromaUrl, {
        timeout: 2000
      });
      
      // ChromaDB is running if heartbeat returns 200 with nanosecond timestamp
      return response.status === 200 && response.data && response.data['nanosecond heartbeat'];
    } catch (error) {
      console.warn('⚠️ Vector database not available:', error.message);
      return false;
    }
  }

  /**
   * Check if embedding service is available
   */
  async isEmbeddingServiceAvailable() {
    try {
      // Simple HTTP check to Ollama without calling embeddings API
      const ollamaVersionUrl = `${getLlmConfig().providers.ollama.baseUrl}/api/version`;
      const response = await this.axios.get(ollamaVersionUrl, {
        timeout: 2000
      });
      return response.status === 200;
    } catch (error) {
      console.warn('⚠️ Embedding service not available:', error);
      return false;
    }
  }

  /**
   * Get RAG service status
   */
  async getStatus() {
    const vectorDB = await this.isVectorDBAvailable();
    const embeddingService = await this.isEmbeddingServiceAvailable();
    
    return {
      vectorDB,
      embeddingService,
      ready: vectorDB && embeddingService
    };
  }
}

// Export singleton instance
const ragService = new RAGService(fs, chromaService, axios);
export default ragService;

let __test__ = undefined;

if (process.env.NODE_ENV === 'test') {
  __test__ = {
    setPdfParse: (fn) => { pdfParse = fn; },
    setLoadPdfParse: (fn) => { loadPdfParse = fn; },
    setChromaService: (service) => { ragService.setChromaService(service); },
    setFs: (fsModule) => { ragService.setFs(fsModule); },
    setAxios: (axiosInstance) => { ragService.setAxios(axiosInstance); }
  };
}

export { __test__ };

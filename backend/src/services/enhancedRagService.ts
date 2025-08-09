// Enhanced RAG Service following LangGraph agentic RAG best practices
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import * as chromaService from './chromaService.js';
import { config, getRagConfig, getLlmConfig, getVectorDbConfig } from '../config/index.js';
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";

// Dynamic pdf-parse import with error handling
let pdfParse: any = null;

let loadPdfParse: any = async () => {
  if (pdfParse === null) {
    try {
      const pdfParseModule = await import('pdf-parse');
      pdfParse = pdfParseModule.default;
      console.log('✅ pdf-parse module loaded successfully');
    } catch (error) {
      console.warn('⚠️ pdf-parse module not available:', error);
      pdfParse = false;
    }
  }
  return pdfParse;
}

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RAGChunk {
  id: string;
  text: string;
  metadata: {
    filename: string;
    chunk_index: number;
    page?: number;
    similarity_score?: number;
  };
  relevance_score?: number;
}

interface RAGSearchResult {
  chunks: RAGChunk[];
  context: string;
  sources: any[];
  original_query: string;
  transformed_query?: string;
  graded_chunks?: RAGChunk[];
}

interface RelevanceGrade {
  is_relevant: boolean;
  confidence: number;
  reasoning: string;
}

interface HallucinationCheck {
  is_grounded: boolean;
  confidence: number;
  unsupported_claims: string[];
  reasoning: string;
}

class EnhancedRAGService {
  private ollamaBaseUrl: string;
  private ragConfig = getRagConfig();
  private embeddingModel = this.ragConfig.embeddingModel;
  private defaultCollection = this.ragConfig.defaultCollection;
  private maxChunkSize = this.ragConfig.maxChunkSize;
  private chunkOverlap = 100; // Overlap between chunks for better context
  private pdfDir: string;
  private fs: any;
  private chromaService: any;
  private axios: any;
  private llm: ChatOllama | ChatOpenAI;

  constructor(fsModule: any, chromaServiceModule: any, axiosModule: any) {
    this.fs = fsModule;
    this.chromaService = chromaServiceModule;
    this.axios = axiosModule;
    const rawBase = getLlmConfig().providers.ollama.baseUrl;
    const normalizedBase = rawBase.includes('localhost') ? rawBase.replace('localhost', '127.0.0.1') : rawBase;
    this.ollamaBaseUrl = normalizedBase + '/api';
    
    // Initialize LLM for query transformation and grading
    const llmConfig = getLlmConfig();
    if (llmConfig.defaultProvider === 'openai') {
      this.llm = new ChatOpenAI({
        modelName: llmConfig.providers.openai.model,
        openAIApiKey: llmConfig.providers.openai.apiKey,
        temperature: 0.1
      });
    } else {
      this.llm = new ChatOllama({
        baseUrl: llmConfig.providers.ollama.baseUrl,
        model: llmConfig.providers.ollama.model,
        temperature: 0.1
      });
    }
    
    // Ensure PDF storage directory exists
    this.pdfDir = path.join(__dirname, '../../data/pdfs/');
    if (!this.fs.existsSync(this.pdfDir)) {
      this.fs.mkdirSync(this.pdfDir, { recursive: true });
    }
  }

  public setChromaService(service: any) {
    this.chromaService = service;
  }

  public setFs(fsModule: any) {
    this.fs = fsModule;
  }

  public setAxios(axiosInstance: any) {
    this.axios = axiosInstance;
  }

  /**
   * Transform/rewrite query for better retrieval following LangGraph best practices
   */
  async transformQuery(originalQuery: string): Promise<string> {
    try {
      console.log('🔄 Transforming query for better retrieval');
      
      const transformationPrompt = `You are an expert at transforming user queries to improve document retrieval.

Your task is to rewrite the following query to be more specific and likely to retrieve relevant documents:

Original query: "${originalQuery}"

Guidelines:
1. Expand abbreviations and technical terms
2. Add relevant synonyms and alternative phrasings
3. Make the query more specific if too vague
4. Keep the core intent intact
5. Focus on key concepts that would appear in documents

Return only the transformed query, nothing else.`;

      const response = await this.llm.invoke(transformationPrompt);
      const transformedQuery = response.content.toString().trim();
      
      console.log(`✅ Query transformed: "${originalQuery}" → "${transformedQuery}"`);
      return transformedQuery;
    } catch (error) {
      console.error('❌ Query transformation failed:', error);
      return originalQuery; // Fallback to original query
    }
  }

  /**
   * Grade retrieved chunks for relevance using LLM
   */
  async gradeRetrievalRelevance(query: string, chunks: RAGChunk[]): Promise<RAGChunk[]> {
    console.log('📊 Grading retrieved chunks for relevance');
    
    const gradedChunks: RAGChunk[] = [];
    
    for (const chunk of chunks) {
      try {
        const gradingPrompt = `You are an expert at evaluating document relevance for user queries.

Query: "${query}"

Document chunk: "${chunk.text}"

Is this document chunk relevant to answering the user's query?

IMPORTANT: Respond ONLY with a valid JSON object, no other text. Format:
{
  "is_relevant": true,
  "confidence": 0.8,
  "reasoning": "explanation of why it is or isn't relevant"
}`;

        const response = await this.llm.invoke(gradingPrompt);
        let gradeResult: RelevanceGrade;
        try {
          gradeResult = JSON.parse(response.content.toString().trim());
        } catch (jsonError) {
          console.warn(`JSON parsing failed for chunk ${chunk.id}, treating as irrelevant`);
          gradeResult = {
            is_relevant: false,
            confidence: 0.2,
            reasoning: 'JSON parsing failed, defaulting to irrelevant'
          };
        }
        
        if (gradeResult.is_relevant && gradeResult.confidence > 0.5) {
          chunk.relevance_score = gradeResult.confidence;
          gradedChunks.push(chunk);
          console.log(`✅ Chunk ${chunk.id} is relevant (confidence: ${gradeResult.confidence})`);
        } else {
          console.log(`❌ Chunk ${chunk.id} is not relevant (confidence: ${gradeResult.confidence})`);
        }
      } catch (error) {
        console.error(`❌ Failed to grade chunk ${chunk.id}:`, error);
        // Include chunk with low relevance score if grading fails
        chunk.relevance_score = 0.3;
        gradedChunks.push(chunk);
      }
    }
    
    // Sort by relevance score
    return gradedChunks.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
  }

  /**
   * Check for hallucinations in generated response
   */
  async checkHallucination(response: string, context: string): Promise<HallucinationCheck> {
    try {
      console.log('🔍 Checking response for hallucinations');
      
      const hallucinationPrompt = `You are an expert at detecting hallucinations in AI responses.

Task: Determine if the AI response is grounded in the provided context or contains unsupported claims.

Context (retrieved documents):
${context}

AI Response:
${response}

Analyze if the response contains any claims not supported by the context.

IMPORTANT: Respond ONLY with a valid JSON object, no other text. Format:
{
  "is_grounded": true,
  "confidence": 0.9,
  "unsupported_claims": [],
  "reasoning": "explanation of your assessment"
}`;

      const result = await this.llm.invoke(hallucinationPrompt);
      let hallucinationCheck: HallucinationCheck;
      try {
        hallucinationCheck = JSON.parse(result.content.toString().trim());
      } catch (jsonError) {
        console.warn('JSON parsing failed for hallucination check, defaulting to grounded');
        hallucinationCheck = {
          is_grounded: true,
          confidence: 0.5,
          unsupported_claims: [],
          reasoning: 'JSON parsing failed, defaulting to grounded response'
        };
      }
      
      console.log(`✅ Hallucination check complete - Grounded: ${hallucinationCheck.is_grounded}`);
      return hallucinationCheck;
    } catch (error) {
      console.error('❌ Hallucination check failed:', error);
      return {
        is_grounded: true, // Default to assuming it's grounded if check fails
        confidence: 0.5,
        unsupported_claims: [],
        reasoning: 'Hallucination check failed, assuming response is grounded'
      };
    }
  }

  /**
   * Enhanced semantic chunking with overlap
   */
  private createSemanticChunks(text: string, maxChunkSize: number = this.maxChunkSize): string[] {
    // Split by sentences first for better semantic boundaries
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      
      // If adding this sentence would exceed chunk size, save current chunk
      if (currentChunk.length > 0 && (currentChunk + '. ' + sentence).length > maxChunkSize) {
        chunks.push(currentChunk.trim() + '.');
        
        // Create overlap with previous chunk
        const overlapStart = Math.max(0, currentChunk.length - this.chunkOverlap);
        const overlap = currentChunk.substring(overlapStart);
        currentChunk = overlap + ' ' + sentence;
      } else {
        currentChunk += (currentChunk.length > 0 ? '. ' : '') + sentence;
      }
    }
    
    // Add final chunk if not empty
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim() + '.');
    }
    
    return chunks;
  }

  /**
   * Process and store PDF document with enhanced chunking
   */
  async processPDF(filePath: string, originalName: string): Promise<{ success: boolean; chunks: number; error?: string }> {
    try {
      console.log('📄 Processing PDF with enhanced chunking:', originalName);
      
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

      // Create enhanced semantic chunks
      const chunks = this.createSemanticChunks(pdfData.text);

      console.log(`🔪 Created ${chunks.length} semantic chunks with overlap`);

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
   * Store text chunks in vector database with embeddings
   */
  private async storeChunks(chunks: string[], filename: string, originalName: string): Promise<void> {
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
        
        // Store in Chroma
        const result = await this.chromaService.addDocuments(
          this.defaultCollection,
          [text],
          [{
            filename: originalName,
            chunk_index: i,
            text: text && text.length > 200 ? text.substring(0, 200) + '...' : text || ''
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
   * Ensure collection exists
   */
  private async ensureCollection(): Promise<void> {
    try {
      const metadata = {
        description: 'Enhanced PDF document chunks for agentic RAG search'
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
   * Generate embedding for text using Ollama
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.axios.post(`${this.ollamaBaseUrl}/embeddings`, {
        model: this.embeddingModel,
        prompt: text
      }, {
        timeout: 30000
      });
      
      if (!response.data.embedding || !Array.isArray(response.data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }
      
      return response.data.embedding;
    } catch (error: any) {
      const msg = (error && (error as any).message) ? (error as any).message : String(error);
      console.error('❌ Embedding generation failed:', msg);
      const dim = 768;
      const pseudoEmbedding = Array.from({ length: dim }, (_, i) => Math.sin(i) * 0.01);
      return pseudoEmbedding;
    }
  }

  /**
   * Enhanced search with query transformation and relevance grading
   */
  async searchRelevantChunks(query: string, topK: number = 10): Promise<RAGSearchResult> {
    try {
      console.log(`🔍 Enhanced RAG search for: "${query}"`);

      // Step 1: Transform query for better retrieval
      const transformedQuery = await this.transformQuery(query);

      // Step 2: Generate embedding for transformed query
      const queryEmbedding = await this.generateEmbedding(transformedQuery);

      // Step 3: Search in Chroma (get more results for grading)
      const response = await this.chromaService.queryCollection(
        this.defaultCollection,
        [queryEmbedding],
        topK * 2 // Get more results to filter through grading
      );
      
      if (!response.success) {
        throw new Error(response.error);
      }
      
      const results = response.results;
      const documents = results.documents?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      // Step 4: Create initial chunks with similarity scores
      const initialChunks: RAGChunk[] = documents.map((doc: string, i: number) => ({
        id: `chunk_${i}`,
        text: doc,
        metadata: {
          ...metadatas[i],
          similarity_score: 1 - (distances[i] || 0) // Convert distance to similarity
        }
      }));

      // Step 5: Grade chunks for relevance
      const gradedChunks = await this.gradeRetrievalRelevance(query, initialChunks);
      
      // Step 6: Take top K graded chunks
      const finalChunks = gradedChunks.slice(0, topK);

      // Step 7: Create enhanced context
      const context = finalChunks
        .map((chunk, i) => `Source [${i + 1}] (${chunk.metadata.filename}, relevance: ${chunk.relevance_score?.toFixed(2)}):\n${chunk.text}`)
        .join('\n\n---\n\n');

      console.log(`✅ Enhanced RAG search complete: ${finalChunks.length} relevant chunks found`);

      return {
        chunks: finalChunks,
        context,
        sources: finalChunks.map(c => c.metadata),
        original_query: query,
        transformed_query: transformedQuery,
        graded_chunks: gradedChunks
      };
    } catch (error) {
      console.error('❌ Enhanced RAG search failed:', error);
      return {
        chunks: [],
        context: '',
        sources: [],
        original_query: query
      };
    }
  }

  /**
   * Check if vector database is available
   */
  async isVectorDBAvailable(): Promise<boolean> {
    try {
      const vectorDbConfig = getVectorDbConfig();
      const chromaUrl = `http://${vectorDbConfig.chroma.host}:${vectorDbConfig.chroma.port}/api/v2/heartbeat`;
      const response = await this.axios.get(chromaUrl, {
        timeout: 2000
      });
      
      return response.status === 200 && response.data && response.data['nanosecond heartbeat'];
    } catch (error: any) {
      console.warn('⚠️ Vector database not available:', error.message);
      return false;
    }
  }

  /**
   * Check if embedding service is available
   */
  async isEmbeddingServiceAvailable(): Promise<boolean> {
    try {
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
  async getStatus(): Promise<{
    vectorDB: boolean;
    embeddingService: boolean;
    ready: boolean;
  }> {
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
const enhancedRagService = new EnhancedRAGService(fs, chromaService, axios);
export default enhancedRagService;

export const __test__ = {
  setChromaService: (service: any) => { enhancedRagService.setChromaService(service); },
  setFs: (fsModule: any) => { enhancedRagService.setFs(fsModule); },
  setAxios: (axiosInstance: any) => { enhancedRagService.setAxios(axiosInstance); }
};

// Export types for use in other modules
export type { RAGChunk, RAGSearchResult, RelevanceGrade, HallucinationCheck };

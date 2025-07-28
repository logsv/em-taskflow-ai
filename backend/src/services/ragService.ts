// RAG (Retrieval-Augmented Generation) service for PDF processing and vector search
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Dynamic pdf-parse import with error handling
let pdfParse: any = null;

async function loadPdfParse() {
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

interface RAGChunk {
  id: string;
  text: string;
  metadata: {
    filename: string;
    chunk_index: number;
    page?: number;
  };
}

interface RAGSearchResult {
  chunks: RAGChunk[];
  context: string;
  sources: any[];
}

class RAGService {
  private ollamaBaseUrl = 'http://localhost:11434/api';
  private embeddingModel = 'nomic-embed-text';
  private defaultCollection = 'pdf_chunks';
  private pdfDir: string;
  private chromaScriptPath: string;

  constructor() {
    // Ensure PDF storage directory exists
    this.pdfDir = path.join(__dirname, '../../data/pdfs/');
    if (!fs.existsSync(this.pdfDir)) {
      fs.mkdirSync(this.pdfDir, { recursive: true });
    }
    
    // Set path to Chroma Python script
    this.chromaScriptPath = path.join(__dirname, '../scripts/chroma_client.py');
  }

  /**
   * Process and store PDF document in vector database
   */
  async processPDF(filePath: string, originalName: string): Promise<{ success: boolean; chunks: number; error?: string }> {
    try {
      console.log('📄 Processing PDF:', originalName);
      
      // Load pdf-parse dynamically
      const pdfParseFunction = await loadPdfParse();
      if (!pdfParseFunction) {
        throw new Error('PDF parsing service not available');
      }
      
      // Read and parse PDF
      const dataBuffer = fs.readFileSync(filePath);
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
  private createChunks(text: string, maxChunkSize: number = 1000): string[] {
    // Split by paragraphs first
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
    const chunks: string[] = [];
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
  private async ensureCollection(): Promise<void> {
    try {
      const metadata = JSON.stringify({
        description: 'PDF document chunks for RAG search'
      });
      
      const { stdout } = await execAsync(
        `/bin/bash -c "source ${path.join(__dirname, '../../../chroma-env/bin/activate')} && python3 '${this.chromaScriptPath}' create_collection '${this.defaultCollection}' '${metadata}'"`,
        { cwd: path.dirname(this.chromaScriptPath) }
      );
      
      const result = JSON.parse(stdout.trim());
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
        
        // Store in Chroma using Python script
        const data = JSON.stringify({
          documents: [text],
          metadatas: [{
            filename: originalName,
            chunk_index: i,
            text: text && text.length > 200 ? text.substring(0, 200) + '...' : text || '' // Store preview in metadata
          }],
          ids: [chunkId],
          embeddings: [embedding]
        });
        
        const { stdout } = await execAsync(
          `/bin/bash -c "source ${path.join(__dirname, '../../../chroma-env/bin/activate')} && python3 '${this.chromaScriptPath}' add_documents '${this.defaultCollection}' '${data.replace(/'/g, "'\"'\"'")}'"`
        );
        
        const result = JSON.parse(stdout.trim());
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
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.ollamaBaseUrl}/embeddings`, {
        model: this.embeddingModel,
        prompt: text
      });
      return response.data.embedding;
    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Search for relevant chunks based on query
   */
  async searchRelevantChunks(query: string, topK: number = 5): Promise<RAGSearchResult> {
    try {
      console.log(`🔍 Searching for relevant chunks: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Search in Chroma using Python script
      const queryData = JSON.stringify({
        query_embeddings: [queryEmbedding],
        n_results: topK
      });
      
      const { stdout } = await execAsync(
        `/bin/bash -c "source ${path.join(__dirname, '../../../chroma-env/bin/activate')} && python3 '${this.chromaScriptPath}' query '${this.defaultCollection}' '${queryData.replace(/'/g, "'\"'\"'")}'"`
      );
      
      const response = JSON.parse(stdout.trim());
      if (!response.success) {
        throw new Error(response.error);
      }
      
      const results = response.results;
      const documents = results.documents?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      // Create structured results
      const chunks: RAGChunk[] = documents.map((doc: string, i: number) => ({
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
  async isVectorDBAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `/bin/bash -c "source ${path.join(__dirname, '../../../chroma-env/bin/activate')} && python3 '${this.chromaScriptPath}' list_collections"`
      );
      
      const result = JSON.parse(stdout.trim());
      return result.success;
    } catch (error) {
      console.warn('⚠️ Vector database not available:', error);
      return false;
    }
  }

  /**
   * Check if embedding service is available
   */
  async isEmbeddingServiceAvailable(): Promise<boolean> {
    try {
      await axios.post(`${this.ollamaBaseUrl}/embeddings`, {
        model: this.embeddingModel,
        prompt: 'test'
      });
      return true;
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
const ragService = new RAGService();
export default ragService;

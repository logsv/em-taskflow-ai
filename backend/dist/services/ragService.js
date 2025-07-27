// RAG (Retrieval-Augmented Generation) service for PDF processing and vector search
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
// Dynamic pdf-parse import with error handling
let pdfParse = null;
async function loadPdfParse() {
    if (pdfParse === null) {
        try {
            const pdfParseModule = await import('pdf-parse');
            pdfParse = pdfParseModule.default;
            console.log('✅ pdf-parse module loaded successfully');
        }
        catch (error) {
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
    chromaBaseUrl = 'http://localhost:8000/api/v1';
    ollamaBaseUrl = 'http://localhost:11434/api';
    embeddingModel = 'nomic-embed-text';
    defaultCollection = 'pdf_chunks';
    pdfDir;
    constructor() {
        // Ensure PDF storage directory exists
        this.pdfDir = path.join(__dirname, '../../data/pdfs/');
        if (!fs.existsSync(this.pdfDir)) {
            fs.mkdirSync(this.pdfDir, { recursive: true });
        }
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
        }
        catch (error) {
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
    createChunks(text, maxChunkSize = 1000) {
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
            }
            else {
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
     * Store text chunks in vector database with embeddings
     */
    async storeChunks(chunks, filename, originalName) {
        console.log(`💾 Storing ${chunks.length} chunks in vector database`);
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
                await axios.post(`${this.chromaBaseUrl}/collections/${this.defaultCollection}/add`, {
                    ids: [chunkId],
                    embeddings: [embedding],
                    metadatas: [{
                            filename: originalName,
                            chunk_index: i,
                            text: text && text.length > 200 ? text.substring(0, 200) + '...' : text || '' // Store preview in metadata
                        }],
                    documents: [text]
                });
                console.log(`✅ Stored chunk ${i + 1}/${chunks.length}`);
            }
            catch (error) {
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
            const response = await axios.post(`${this.ollamaBaseUrl}/embeddings`, {
                model: this.embeddingModel,
                prompt: text
            });
            return response.data.embedding;
        }
        catch (error) {
            console.error('❌ Embedding generation failed:', error);
            throw new Error('Failed to generate embedding');
        }
    }
    /**
     * Search for relevant chunks based on query
     */
    async searchRelevantChunks(query, topK = 5) {
        try {
            console.log(`🔍 Searching for relevant chunks: "${query}"`);
            // Generate query embedding
            const queryEmbedding = await this.generateEmbedding(query);
            // Search in Chroma
            const searchResponse = await axios.post(`${this.chromaBaseUrl}/collections/${this.defaultCollection}/query`, {
                query_embeddings: [queryEmbedding],
                n_results: topK
            });
            const results = searchResponse.data;
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
        }
        catch (error) {
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
            await axios.get(`${this.chromaBaseUrl}/collections`);
            return true;
        }
        catch (error) {
            console.warn('⚠️ Vector database not available:', error);
            return false;
        }
    }
    /**
     * Check if embedding service is available
     */
    async isEmbeddingServiceAvailable() {
        try {
            await axios.post(`${this.ollamaBaseUrl}/embeddings`, {
                model: this.embeddingModel,
                prompt: 'test'
            });
            return true;
        }
        catch (error) {
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
const ragService = new RAGService();
export default ragService;
//# sourceMappingURL=ragService.js.map
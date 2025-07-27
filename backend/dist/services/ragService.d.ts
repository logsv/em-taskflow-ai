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
declare class RAGService {
    private chromaBaseUrl;
    private ollamaBaseUrl;
    private embeddingModel;
    private defaultCollection;
    private pdfDir;
    constructor();
    /**
     * Process and store PDF document in vector database
     */
    processPDF(filePath: string, originalName: string): Promise<{
        success: boolean;
        chunks: number;
        error?: string;
    }>;
    /**
     * Create text chunks from PDF content
     */
    private createChunks;
    /**
     * Store text chunks in vector database with embeddings
     */
    private storeChunks;
    /**
     * Generate embedding for text using Ollama
     */
    private generateEmbedding;
    /**
     * Search for relevant chunks based on query
     */
    searchRelevantChunks(query: string, topK?: number): Promise<RAGSearchResult>;
    /**
     * Check if vector database is available
     */
    isVectorDBAvailable(): Promise<boolean>;
    /**
     * Check if embedding service is available
     */
    isEmbeddingServiceAvailable(): Promise<boolean>;
    /**
     * Get RAG service status
     */
    getStatus(): Promise<{
        vectorDB: boolean;
        embeddingService: boolean;
        ready: boolean;
    }>;
}
declare const ragService: RAGService;
export default ragService;
//# sourceMappingURL=ragService.d.ts.map
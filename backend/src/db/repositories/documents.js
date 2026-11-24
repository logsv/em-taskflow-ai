/**
 * RAG document chunks (delegates to the Python AI service).
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */
import pythonAIServiceClient from '../../pythonAi/client.js';

export class DocumentRepository {
  async upsertPdfChunks(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return 0;
    const filename = chunks[0]?.filename || 'doc.pdf';
    const textContent = chunks.map((c) => c.content).join('\n\n');
    const res = await pythonAIServiceClient.processRAGIngestion(textContent, filename);
    return res?.chunks?.length || chunks.length;
  }

  async hybridSearchPdfChunks({ query, embedding = null, topK = 20, metadataFilter = null } = {}) {
    const filterFilename = metadataFilter?.filename || '';
    const results = await pythonAIServiceClient.searchRAG(query, topK, filterFilename);
    return results.map((r) => ({
      id: r.metadata.id,
      documentId: r.metadata.filename,
      filename: r.metadata.filename,
      chunkIndex: r.metadata.chunkIndex,
      content: r.pageContent,
      parentContent: r.metadata.parentContent,
      score: r.metadata.score,
    }));
  }

  async getPdfChunksByFilename(filename, topK = 100) {
    const results = await pythonAIServiceClient.getDocumentChunks(filename);
    if (results && results.length > 0) {
      return results.map((r) => ({
        id: r.metadata.id,
        documentId: r.metadata.filename,
        filename: r.metadata.filename,
        chunkIndex: r.metadata.chunkIndex,
        content: r.pageContent,
        parentContent: r.metadata.parentContent,
        score: r.metadata.score,
      }));
    }
    return this.hybridSearchPdfChunks({ query: '', topK, metadataFilter: { filename } });
  }

  async deletePdfDocument(filename) {
    const res = await pythonAIServiceClient.deleteDocument(filename);
    return res?.deleted_chunks || 0;
  }

  async listPdfDocuments() {
    const docs = await pythonAIServiceClient.listDocuments();
    return docs.map((d) => ({
      id: d.filename,
      filename: d.filename,
      chunkCount: d.total_chunks,
      lastUpdated: d.created_at,
    }));
  }
}

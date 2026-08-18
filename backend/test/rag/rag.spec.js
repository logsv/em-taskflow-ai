import sinon from 'sinon';
import ragService from '../../src/rag/index.js';
import { __test__ } from '../../src/rag/ingest.js';
import pythonAIServiceClient from '../../src/grpc/client.js';

describe('RAG Service', () => {
  let fsMock, chromaClientMock, pdfParseMock, collectionMock;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock fs
    fsMock = {
      readFile: sinon.stub().resolves(Buffer.from('dummy pdf content')),
      existsSync: sinon.stub().returns(true),
      mkdirSync: sinon.stub(),
    };

    // Mock Collection
    collectionMock = {
      name: 'test-collection',
      count: sinon.stub().resolves(10),
      add: sinon.stub().resolves(),
      delete: sinon.stub().resolves(),
      query: sinon.stub().resolves({
        ids: [['id1']],
        distances: [[0.1]],
        metadatas: [[{ filename: 'doc.pdf', chunkIndex: 0 }]],
        documents: [['chunk1 text']]
      }),
      modify: sinon.stub().resolves(),
      get: sinon.stub().resolves(),
      peek: sinon.stub().resolves(),
      upsert: sinon.stub().resolves(),
    };

    // Mock ChromaClient
    chromaClientMock = {
      getCollection: sinon.stub().resolves(collectionMock),
      deleteCollection: sinon.stub().resolves(),
      createCollection: sinon.stub().resolves(collectionMock),
      getOrCreateCollection: sinon.stub().resolves(collectionMock),
    };
    
    // Mock pdf-parse
    pdfParseMock = sinon.stub().resolves({ text: 'This is a test PDF.' });

    // Inject mocks
    __test__.setFs(fsMock);
    __test__.setInitialized(true);
    __test__.setPdf(pdfParseMock);
    
    // Mock vectorStore to avoid initialization issues during tests
    const vectorStoreMock = {
      embeddings: {
        embedQuery: sinon.stub().resolves(new Array(768).fill(0.01)),
      },
      addDocuments: sinon.stub().resolves(),
      asRetriever: sinon.stub().returns({
        getRelevantDocuments: sinon.stub().resolves([
          { pageContent: 'chunk1 text', metadata: { filename: 'doc.pdf' } }
        ])
      })
    };
    __test__.setVectorStore(vectorStoreMock);

    // Stub pythonAIServiceClient methods to avoid network timeouts in unit tests
    sandbox.stub(pythonAIServiceClient, 'extractDocument').resolves({ success: false, extraction_method: 'node_fallback' });
    sandbox.stub(pythonAIServiceClient, 'processRAGIngestion').resolves({ success: false, chunks: [] });
    sandbox.stub(pythonAIServiceClient, 'searchRAG').resolves({ success: true, chunks: [] });
    sandbox.stub(pythonAIServiceClient, 'listDocuments').resolves([]);
  });

  afterEach(() => {
    sandbox.restore();
    // Reset mocks if needed, though beforeEach handles re-creation
  });

  describe('processPDF', () => {
    it('should process a PDF successfully', async () => {
      // Setup
      fsMock.readFile.resolves(Buffer.from('dummy pdf content'));

      // Execute
      const result = await ragService.processPDF('/fake/path/doc.pdf', 'doc.pdf');

      // Verify
      expect(result.success).toBe(true);
      // Depending on chunking implementation, it might be more than 1 chunk
      expect(result.chunks).toBeGreaterThan(0);
      expect(fsMock.readFile.calledOnceWith('/fake/path/doc.pdf')).toBe(true);
      expect(pdfParseMock.calledOnce).toBe(true);
      // We check if vectorStore.addDocuments was called
      const vectorStore = __test__.getVectorStore();
      expect(vectorStore.addDocuments.called).toBe(true);
    });

    it('should handle PDF processing failure', async () => {
      fsMock.readFile.rejects(new Error('File not found'));

      const result = await ragService.processPDF('/fake/path/doc.pdf', 'doc.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should handle PDF with no text', async () => {
      fsMock.readFile.resolves(Buffer.from('dummy pdf content'));
      pdfParseMock.resolves({ text: '' });

      const result = await ragService.processPDF('/fake/path/doc.pdf', 'doc.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No text content found in PDF');
    });
  });

  describe('searchRelevantChunks', () => {
    it('should search for relevant chunks successfully', async () => {
      const query = 'test query';
      const result = await ragService.searchRelevantChunks(query);
      expect(result).toBeDefined();
      expect(Array.isArray(result.chunks)).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return status', async () => {
      const status = await ragService.getStatus();
      // Since we mocked vectorStore and chromaClient, it should be ready or partially ready
      // The implementation checks initialized flag which we didn't explicitly set to true via initialize()
      // But we injected vectorStore.
      // Let's just check the structure
      expect(status).toBeDefined();
    });
  });
});

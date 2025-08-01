import sinon from 'sinon';
import ragService, { __test__ } from '../../src/services/ragService.js';

describe('RAG Service', () => {
  let fsMock: any, chromaServiceMock: any, axiosMock: any, pdfParseMock: any;

  beforeEach(() => {
    // Create detailed mock objects
    fsMock = {
      readFileSync: sinon.stub(),
      existsSync: sinon.stub().returns(true),
      mkdirSync: sinon.stub(),
    };

    chromaServiceMock = {
      createCollection: sinon.stub().resolves({ success: true, message: 'Collection created or already exists' }),
      addDocuments: sinon.stub().resolves({ success: true }),
      queryCollection: sinon.stub().resolves({ success: true, results: {} }),
      listCollections: sinon.stub().resolves({ success: true }),
    };

    axiosMock = {
      post: sinon.stub().resolves({ data: { embedding: [0.1, 0.2, 0.3] } }),
    };

    pdfParseMock = sinon.stub().resolves({ text: 'This is a test PDF.' });

    // Inject mocks
    __test__.setFs(fsMock);
    __test__.setChromaService(chromaServiceMock);
    __test__.setAxios(axiosMock);
    __test__.setLoadPdfParse(() => Promise.resolve(pdfParseMock));
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('processPDF', () => {
    it('should process a PDF successfully', async () => {
      fsMock.readFileSync.returns(Buffer.from('dummy pdf content'));

      const result = await ragService.processPDF('/fake/path/doc.pdf', 'doc.pdf');

      expect(result.success).toBe(true);
      expect(result.chunks).toBe(1);
      expect(fsMock.readFileSync.calledOnceWith('/fake/path/doc.pdf')).toBe(true);
      expect(pdfParseMock.calledOnce).toBe(true);
      expect(chromaServiceMock.addDocuments.calledOnce).toBe(true);
    });

    it('should handle PDF processing failure', async () => {
      fsMock.readFileSync.throws(new Error('File not found'));

      const result = await ragService.processPDF('/fake/path/doc.pdf', 'doc.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should handle PDF with no text', async () => {
        fsMock.readFileSync.returns(Buffer.from('dummy pdf content'));
        pdfParseMock.resolves({ text: '' });
  
        const result = await ragService.processPDF('/fake/path/doc.pdf', 'doc.pdf');
  
        expect(result.success).toBe(false);
        expect(result.error).toBe('PDF contains no extractable text');
      });
  });

  describe('searchRelevantChunks', () => {
    it('should search for relevant chunks successfully', async () => {
      const query = 'test query';
      const mockResults = {
        documents: [['chunk1 text']],
        metadatas: [[{ filename: 'doc.pdf' }]],
        distances: [[0.1]],
      };
      chromaServiceMock.queryCollection.resolves({ success: true, results: mockResults });

      const result = await ragService.searchRelevantChunks(query);

      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].text).toBe('chunk1 text');
      expect(axiosMock.post.calledOnceWith(sinon.match.any, { model: 'nomic-embed-text', prompt: query })).toBe(true);
      expect(chromaServiceMock.queryCollection.calledOnce).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return ready status when all services are available', async () => {
      const status = await ragService.getStatus();
      expect(status.ready).toBe(true);
      expect(status.vectorDB).toBe(true);
      expect(status.embeddingService).toBe(true);
    });

    it('should return not ready when vectorDB is unavailable', async () => {
      chromaServiceMock.listCollections.resolves({ success: false });
      const status = await ragService.getStatus();
      expect(status.ready).toBe(false);
      expect(status.vectorDB).toBe(false);
    });

    it('should return not ready when embedding service is unavailable', async () => {
        axiosMock.post.withArgs(sinon.match.string, sinon.match.has('prompt', 'test'))
                      .rejects(new Error('Service down'));
      
        const status = await ragService.getStatus();
      
        expect(status.ready).toBe(false);
        expect(status.embeddingService).toBe(false);
      });
  });
});
import sinon from 'sinon';
import ragService, { __test__ } from '../src/services/ragService.js';
const mockPdfParse = sinon.stub();
describe('RAG Service', () => {
    let fsReadFileSyncStub;
    let fsExistsSyncStub;
    let fsMkdirSyncStub;
    let axiosPostStub;
    let axiosGetStub;
    let chromaCreateCollectionStub;
    let chromaAddDocumentsStub;
    let chromaQueryCollectionStub;
    let chromaListCollectionsStub;
    beforeEach(() => {
        const mockFs = {
            readFileSync: sinon.stub(),
            existsSync: sinon.stub(),
            mkdirSync: sinon.stub(),
        };
        __test__.setFs(mockFs);
        fsReadFileSyncStub = mockFs.readFileSync;
        fsExistsSyncStub = mockFs.existsSync;
        fsMkdirSyncStub = mockFs.mkdirSync;
        axiosPostStub = sinon.stub();
        axiosGetStub = sinon.stub();
        __test__.setAxios({ post: axiosPostStub, get: axiosGetStub });
        const mockChromaService = {
            createCollection: sinon.stub(),
            addDocuments: sinon.stub(),
            queryCollection: sinon.stub(),
            listCollections: sinon.stub(),
        };
        __test__.setChromaService(mockChromaService);
        chromaCreateCollectionStub = mockChromaService.createCollection;
        chromaAddDocumentsStub = mockChromaService.addDocuments;
        chromaQueryCollectionStub = mockChromaService.queryCollection;
        chromaListCollectionsStub = mockChromaService.listCollections;
        __test__.setLoadPdfParse(async () => mockPdfParse);
        // Default stub behaviors
        fsExistsSyncStub.returns(true); // Assume directory exists by default
        fsMkdirSyncStub.returns(undefined); // No-op for mkdir
        chromaCreateCollectionStub.resolves({ success: true, message: 'Collection created' });
        chromaAddDocumentsStub.resolves({ success: true });
        chromaQueryCollectionStub.resolves({ success: true, results: { documents: [['doc1']], metadatas: [[]], distances: [[]] } });
        chromaListCollectionsStub.resolves({ success: true });
        axiosPostStub.withArgs(sinon.match(/\/embeddings/), sinon.match.any).resolves({ data: { embedding: [0.1, 0.2, 0.3] } });
        axiosPostStub.withArgs(sinon.match(/\/embeddings/), { model: 'nomic-embed-text', prompt: 'test' }).resolves({});
    });
    afterEach(() => {
        sinon.restore();
    });
    describe('processPDF', () => {
        const mockFilePath = '/tmp/test.pdf';
        const mockOriginalName = 'test.pdf';
        const mockPdfText = 'This is a test PDF content. It has multiple sentences.';
        it('should successfully process a PDF and store chunks', async () => {
            fsReadFileSyncStub.returns(Buffer.from('dummy pdf data'));
            mockPdfParse.resolves({ text: mockPdfText });
            const result = await ragService.processPDF(mockFilePath, mockOriginalName);
            expect(result.success).toBe(true);
            expect(result.chunks).toBe(1); // Based on default chunking
            expect(fsReadFileSyncStub.calledOnceWith(mockFilePath)).toBe(true);
            expect(mockPdfParse.calledOnceWith(Buffer.from('dummy pdf data'))).toBe(true);
            expect(chromaCreateCollectionStub.calledOnce).toBe(true);
            expect(chromaAddDocumentsStub.calledOnce).toBe(true);
        });
        it('should return error if PDF contains no extractable text', async () => {
            fsReadFileSyncStub.returns(Buffer.from('dummy pdf data'));
            mockPdfParse.resolves({ text: '' });
            const result = await ragService.processPDF(mockFilePath, mockOriginalName);
            expect(result.success).toBe(false);
            expect(result.error).toBe('PDF contains no extractable text');
        });
        it('should return error if pdf-parse is not available', async () => {
            __test__.setLoadPdfParse(async () => false); // Simulate pdf-parse not being available
            const result = await ragService.processPDF(mockFilePath, mockOriginalName);
            expect(result.success).toBe(false);
            expect(result.error).toBe('PDF parsing service not available');
        });
    });
    describe('generateEmbedding', () => {
        it('should generate an embedding successfully', async () => {
            const text = 'test text';
            const expectedEmbedding = [0.1, 0.2, 0.3];
            axiosPostStub.withArgs(sinon.match(~/embeddings/), { model: 'nomic-embed-text', prompt: text }).resolves({ data: { embedding: expectedEmbedding } });
            const embedding = await ragService.generateEmbedding(text);
            expect(embedding).toEqual(expectedEmbedding);
            expect(axiosPostStub.calledOnce).toBe(true);
        });
        it('should throw an error if embedding generation fails', async () => {
            axiosPostStub.withArgs(sinon.match(~/embeddings/), sinon.match.any).rejects(new Error('Ollama error'));
            await expectAsync(ragService.generateEmbedding('test')).toBeRejectedWithError('Failed to generate embedding');
        });
    });
    describe('searchRelevantChunks', () => {
        it('should return relevant chunks and context', async () => {
            const query = 'test query';
            const mockDocuments = ['chunk1 content', 'chunk2 content'];
            const mockMetadatas = [{ filename: 'file1.pdf' }, { filename: 'file2.pdf' }];
            chromaQueryCollectionStub.resolves({ success: true, results: { documents: [mockDocuments], metadatas: [mockMetadatas], distances: [[0.1, 0.2]] } });
            const result = await ragService.searchRelevantChunks(query);
            expect(result.chunks.length).toBe(2);
            expect(result.chunks[0].text).toBe('chunk1 content');
            expect(result.chunks[0].metadata.filename).toBe('file1.pdf');
            expect(result.context).toContain('Source [1] (file1.pdf):\nchunk1 content');
            expect(result.sources.length).toBe(2);
            expect(chromaQueryCollectionStub.calledOnce).toBe(true);
        });
        it('should return empty results if search fails', async () => {
            chromaQueryCollectionStub.resolves({ success: false, error: 'Chroma error' });
            const result = await ragService.searchRelevantChunks('test query');
            expect(result.chunks).toEqual([]);
            expect(result.context).toBe('');
            expect(result.sources).toEqual([]);
        });
    });
    describe('isVectorDBAvailable', () => {
        it('should return true if vector DB is available', async () => {
            chromaListCollectionsStub.resolves({ success: true });
            const result = await ragService.isVectorDBAvailable();
            expect(result).toBe(true);
        });
        it('should return false if vector DB is not available', async () => {
            chromaListCollectionsStub.resolves({ success: false, error: 'DB error' });
            const result = await ragService.isVectorDBAvailable();
            expect(result).toBe(false);
        });
    });
    describe('isEmbeddingServiceAvailable', () => {
        it('should return true if embedding service is available', async () => {
            axiosPostStub.withArgs(sinon.match(~/embeddings/), sinon.match.any).resolves({});
            const result = await ragService.isEmbeddingServiceAvailable();
            expect(result).toBe(true);
        });
        it('should return false if embedding service is not available', async () => {
            axiosPostStub.withArgs(sinon.match(/embeddings/), sinon.match.any).rejects(new Error('Service down'));
            const result = await ragService.isEmbeddingServiceAvailable();
            expect(result).toBe(false);
        });
    });
    describe('getStatus', () => {
        it('should return correct status when both services are available', async () => {
            chromaListCollectionsStub.resolves({ success: true });
            axiosPostStub.withArgs(sinon.match(~/embeddings/), sinon.match.any).resolves({});
            const status = await ragService.getStatus();
            expect(status.vectorDB).toBe(true);
            expect(status.embeddingService).toBe(true);
            expect(status.ready).toBe(true);
        });
        it('should return correct status when vector DB is unavailable', async () => {
            chromaListCollectionsStub.resolves({ success: false });
            axiosPostStub.withArgs(sinon.match(~/embeddings/), sinon.match.any).resolves({});
            const status = await ragService.getStatus();
            expect(status.vectorDB).toBe(false);
            expect(status.embeddingService).toBe(true);
            expect(status.ready).toBe(false);
        });
        it('should return correct status when embedding service is unavailable', async () => {
            chromaListCollectionsStub.resolves({ success: true });
            axiosPostStub.withArgs(sinon.match(/embeddings/), sinon.match.any).rejects(new Error('Service down'));
            const status = await ragService.getStatus();
            expect(status.vectorDB).toBe(true);
            expect(status.embeddingService).toBe(false);
            expect(status.ready).toBe(false);
        });
        it('should return correct status when both services are unavailable', async () => {
            chromaListCollectionsStub.resolves({ success: false });
            axiosPostStub.withArgs(sinon.match(/embeddings/), sinon.match.any).rejects(new Error('Service down'));
            const status = await ragService.getStatus();
            expect(status.vectorDB).toBe(false);
            expect(status.embeddingService).toBe(false);
            expect(status.ready).toBe(false);
        });
    });
});

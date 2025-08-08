// Mock external services for testing
import sinon from 'sinon';

// Mock console methods to reduce test noise
export const mockConsole = (sandbox: sinon.SinonSandbox) => {
  sandbox.stub(console, 'log');
  sandbox.stub(console, 'error');
  sandbox.stub(console, 'warn');
  sandbox.stub(console, 'info');
  sandbox.stub(console, 'debug');
};

// Mock file system operations
export const mockFileSystem = (sandbox: sinon.SinonSandbox) => {
  // Import using dynamic import for ES modules
  const mockFsPromises = {
    readFile: sandbox.stub().resolves('mocked file content'),
    writeFile: sandbox.stub().resolves(),
    access: sandbox.stub().resolves()
  };
  
  const mockFs = {
    promises: mockFsPromises,
    existsSync: sandbox.stub().returns(true)
  };
  
  const mockPath = {
    resolve: sandbox.stub().returns('/mocked/path')
  };
  
  // These will be used by test files that import fs/path directly
  return { mockFs, mockPath };
};

// Mock HTTP requests
export const mockHttp = (sandbox: sinon.SinonSandbox) => {
  // Mock axios with proper endpoint responses
  const mockAxios = {
    get: sandbox.stub().callsFake((url: string) => {
      // Mock ChromaDB heartbeat endpoint
      if (url.includes('/api/v2/heartbeat')) {
        return Promise.resolve({ 
          status: 200, 
          data: { 'nanosecond heartbeat': Date.now() * 1000000 }
        });
      }
      // Mock Ollama version endpoint
      if (url.includes('/api/version')) {
        return Promise.resolve({ 
          status: 200, 
          data: { version: '0.1.0' }
        });
      }
      // Default response
      return Promise.resolve({ status: 200, data: { message: 'mocked response' } });
    }),
    post: sandbox.stub().callsFake((url: string, data: any) => {
      // Mock Ollama embeddings endpoint
      if (url.includes('/embeddings')) {
        return Promise.resolve({
          status: 200,
          data: { embedding: new Array(384).fill(0).map(() => Math.random()) }
        });
      }
      // Mock other POST requests
      return Promise.resolve({ status: 200, data: { success: true, message: 'mocked response' } });
    })
  };

  // Mock fetch
  const mockFetch = sandbox.stub().resolves({
    ok: true,
    status: 200,
    json: async () => ({ data: 'mocked response' }),
    text: async () => 'mocked response'
  });
  global.fetch = mockFetch as any;
  
  return { mockAxios, mockFetch };
};

// Mock ChromaDB client
export const mockChromaDB = (sandbox: sinon.SinonSandbox) => {
  const mockCollection = {
    add: sandbox.stub().resolves(),
    query: sandbox.stub().resolves({
      ids: [['mock_id_1']],
      documents: [['mock document content']],
      metadatas: [[{ source: 'mock.pdf', filename: 'mock.pdf', chunk_index: 0 }]],
      distances: [[0.5]]
    }),
    get: sandbox.stub().resolves({
      ids: ['mock_id_1'],
      documents: ['mock document content'],
      metadatas: [{ source: 'mock.pdf', filename: 'mock.pdf', chunk_index: 0 }]
    }),
    delete: sandbox.stub().resolves(),
    count: sandbox.stub().resolves(1)
  };

  const mockClient = {
    getCollection: sandbox.stub().resolves(mockCollection),
    createCollection: sandbox.stub().resolves(mockCollection),
    deleteCollection: sandbox.stub().resolves(),
    listCollections: sandbox.stub().resolves([{ name: 'test_collection' }]),
    heartbeat: sandbox.stub().resolves(Date.now() * 1000000) // nanosecond timestamp
  };

  return { mockClient, mockCollection };
};

// Mock SQLite database
export const mockDatabase = (sandbox: sinon.SinonSandbox) => {
  const mockDatabase = {
    run: sandbox.stub().resolves({ lastID: 1, changes: 1 }),
    get: sandbox.stub().resolves({ id: 1, data: 'mock data' }),
    all: sandbox.stub().resolves([{ id: 1, data: 'mock data' }]),
    prepare: sandbox.stub().returns({
      run: sandbox.stub().returns({ lastInsertRowid: 1, changes: 1 }),
      get: sandbox.stub().returns({ id: 1, data: 'mock data' }),
      all: sandbox.stub().returns([{ id: 1, data: 'mock data' }]),
      finalize: sandbox.stub()
    }),
    close: sandbox.stub().resolves()
  };

  return mockDatabase;
};

// Mock PDF processing
export const mockPdfParse = (sandbox: sinon.SinonSandbox) => {
  const mockPdfParse = sandbox.stub().resolves({
    text: 'Mock PDF content extracted successfully',
    numpages: 1,
    info: {
      PDFFormatVersion: '1.4',
      IsAcroFormPresent: false,
      IsXFAPresent: false
    }
  });

  return mockPdfParse;
};

// Mock MCP clients and agents
export const mockMCP = (sandbox: sinon.SinonSandbox) => {
  const mockAgent = {
    run: sandbox.stub().resolves('Mock MCP agent response'),
    stream: sandbox.stub().returns(async function* () {
      yield { type: 'message', content: 'Mock streaming response' };
    }())
  };

  const mockClient = {
    close: sandbox.stub().resolves(),
    closeAllSessions: sandbox.stub().resolves()
  };

  // Mock the MCP classes with proper typing
  const MockMCPClient: any = sandbox.stub().returns(mockClient);
  MockMCPClient.fromDict = sandbox.stub().returns(mockClient);

  const MockMCPAgent = sandbox.stub().returns(mockAgent);

  return { mockAgent, mockClient, MockMCPClient, MockMCPAgent };
};

// Mock LangChain LLM providers
export const mockLangChain = (sandbox: sinon.SinonSandbox) => {
  const mockLLM = {
    invoke: sandbox.stub().resolves('Mock LLM response'),
    stream: sandbox.stub().returns(async function* () {
      yield { content: 'Mock streaming response' };
    }())
  };

  const MockChatOpenAI = sandbox.stub().returns(mockLLM);
  const MockChatOllama = sandbox.stub().returns(mockLLM);

  return { mockLLM, MockChatOpenAI, MockChatOllama };
};

// Create comprehensive mock setup for all tests
export const setupAllMocks = (sandbox: sinon.SinonSandbox) => {
  mockConsole(sandbox);
  const fsMocks = mockFileSystem(sandbox);
  const httpMocks = mockHttp(sandbox);
  
  const chromaMocks = mockChromaDB(sandbox);
  const dbMocks = mockDatabase(sandbox);
  const pdfMocks = mockPdfParse(sandbox);
  const mcpMocks = mockMCP(sandbox);
  const langChainMocks = mockLangChain(sandbox);

  return {
    fsMocks,
    httpMocks,
    chromaMocks,
    dbMocks,
    pdfMocks,
    mcpMocks,
    langChainMocks
  };
};
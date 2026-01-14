import sinon from 'sinon';

export const mockConsole = (sandbox) => {
  sandbox.stub(console, 'log');
  sandbox.stub(console, 'error');
  sandbox.stub(console, 'warn');
  sandbox.stub(console, 'info');
  sandbox.stub(console, 'debug');
};

export const mockFileSystem = (sandbox) => {
  const mockFsPromises = {
    readFile: sandbox.stub().resolves('mocked file content'),
    writeFile: sandbox.stub().resolves(),
    access: sandbox.stub().resolves(),
  };

  const mockFs = {
    promises: mockFsPromises,
    existsSync: sandbox.stub().returns(true),
  };

  const mockPath = {
    resolve: sandbox.stub().returns('/mocked/path'),
  };

  return { mockFs, mockPath };
};

export const mockHttp = (sandbox) => {
  const mockAxios = {
    get: sandbox.stub().callsFake((url) => {
      if (url.includes('/api/v2/heartbeat')) {
        return Promise.resolve({
          status: 200,
          data: { 'nanosecond heartbeat': Date.now() * 1000000 },
        });
      }
      if (url.includes('/api/version')) {
        return Promise.resolve({
          status: 200,
          data: { version: '0.1.0' },
        });
      }
      return Promise.resolve({ status: 200, data: { message: 'mocked response' } });
    }),
    post: sandbox.stub().callsFake((url, data) => {
      if (url.includes('/embeddings')) {
        return Promise.resolve({
          status: 200,
          data: { embedding: new Array(384).fill(0).map(() => Math.random()) },
        });
      }
      return Promise.resolve({ status: 200, data: { success: true, message: 'mocked response' } });
    }),
  };

  const mockFetch = sandbox.stub().resolves({
    ok: true,
    status: 200,
    json: async () => ({ data: 'mocked response' }),
    text: async () => 'mocked response',
  });
  global.fetch = mockFetch;

  return { mockAxios, mockFetch };
};

export const mockChromaDB = (sandbox) => {
  const mockCollection = {
    add: sandbox.stub().resolves(),
    query: sandbox.stub().resolves({
      ids: [['mock_id_1']],
      documents: [['mock document content']],
      metadatas: [[{ source: 'mock.pdf', filename: 'mock.pdf', chunk_index: 0 }]],
      distances: [[0.5]],
    }),
    get: sandbox.stub().resolves({
      ids: ['mock_id_1'],
      documents: ['mock document content'],
      metadatas: [{ source: 'mock.pdf', filename: 'mock.pdf', chunk_index: 0 }],
    }),
    delete: sandbox.stub().resolves(),
    count: sandbox.stub().resolves(1),
  };

  const mockClient = {
    getCollection: sandbox.stub().resolves(mockCollection),
    createCollection: sandbox.stub().resolves(mockCollection),
    deleteCollection: sandbox.stub().resolves(),
    listCollections: sandbox.stub().resolves([{ name: 'test_collection' }]),
    heartbeat: sandbox.stub().resolves(Date.now() * 1000000),
  };

  return { mockClient, mockCollection };
};

export const mockDatabase = (sandbox) => {
  const mockDatabase = {
    run: sandbox.stub().resolves({ lastID: 1, changes: 1 }),
    get: sandbox.stub().resolves({ id: 1, data: 'mock data' }),
    all: sandbox.stub().resolves([{ id: 1, data: 'mock data' }]),
    prepare: sandbox.stub().returns({
      run: sandbox.stub().returns({ lastInsertRowid: 1, changes: 1 }),
      get: sandbox.stub().returns({ id: 1, data: 'mock data' }),
      all: sandbox.stub().returns([{ id: 1, data: 'mock data' }]),
      finalize: sandbox.stub(),
    }),
    close: sandbox.stub().resolves(),
  };

  return mockDatabase;
};

export const mockPdfParse = (sandbox) => {
  const mockPdfParse = sandbox.stub().resolves({
    text: 'Mock PDF content extracted successfully',
    numpages: 1,
    info: {
      PDFFormatVersion: '1.4',
      IsAcroFormPresent: false,
      IsXFAPresent: false,
    },
  });

  return mockPdfParse;
};

export const mockMCP = (sandbox) => {
  const mockAgent = {
    run: sandbox.stub().resolves('Mock MCP agent response'),
    stream: sandbox.stub().returns(
      (async function* () {
        yield { type: 'message', content: 'Mock streaming response' };
      })(),
    ),
  };

  const mockClient = {
    close: sandbox.stub().resolves(),
    closeAllSessions: sandbox.stub().resolves(),
  };

  const MockMCPClient = sandbox.stub().returns(mockClient);
  MockMCPClient.fromDict = sandbox.stub().returns(mockClient);

  const MockMCPAgent = sandbox.stub().returns(mockAgent);

  return { mockAgent, mockClient, MockMCPClient, MockMCPAgent };
};

export const mockLangChain = (sandbox) => {
  const mockLLM = {
    invoke: sandbox.stub().resolves('Mock LLM response'),
    stream: sandbox.stub().returns(
      (async function* () {
        yield { content: 'Mock streaming response' };
      })(),
    ),
  };

  const MockChatOpenAI = sandbox.stub().returns(mockLLM);
  const MockChatOllama = sandbox.stub().returns(mockLLM);

  return { mockLLM, MockChatOpenAI, MockChatOllama };
};

export const setupAllMocks = (sandbox) => {
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
    langChainMocks,
  };
};


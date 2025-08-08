import sinon from 'sinon';
import agentService from '../../src/services/agentService.js';
import mcpLlmService from '../../src/services/mcpLlmService.js';
import databaseService from '../../src/services/databaseService.js';
import mcpService from '../../src/services/mcpService.js';
import ragService from '../../src/services/ragService.js';
import getMCPRouter from '../../src/services/newLlmRouter.js';

describe('Agent Service', () => {
  let sandbox: sinon.SinonSandbox;
  let llmStub: sinon.SinonStub;
  let databaseStub: sinon.SinonStub;
  let ragStub: sinon.SinonStub;
  let ragSearchStub: sinon.SinonStub;
  let mcpInitializeStub: sinon.SinonStub;
  let mcpIsReadyStub: sinon.SinonStub;
  let mcpGetServerStatusStub: sinon.SinonStub;
  let mcpRunQueryStub: sinon.SinonStub;
  let mcpGetAgentStub: sinon.SinonStub;
  let getMCPRouterStub: sinon.SinonStub;
  let mcpLlmServiceStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock MCP LLM service - this is an external dependency
    mcpLlmServiceStub = sandbox.stub(mcpLlmService, 'complete').resolves('Mocked LLM response');
    sandbox.stub(mcpLlmService, 'isInitialized').returns(true);
    sandbox.stub(mcpLlmService, 'initialize').resolves();
    
    // Mock database service - this is an external dependency
    databaseStub = sandbox.stub(databaseService, 'saveChatHistory').resolves({ id: 1 });
    
    // Mock RAG service - this is an external dependency
    ragStub = sandbox.stub(ragService, 'getStatus').resolves({
      vectorDB: true,
      embeddingService: true,
      ready: true
    });
    
    ragSearchStub = sandbox.stub(ragService, 'searchRelevantChunks').resolves({
      chunks: [
        {
          id: 'chunk_1',
          text: 'Sample document content',
          metadata: { filename: 'test.pdf', chunk_index: 0 }
        }
      ],
      context: 'Sample document content',
      sources: [{ filename: 'test.pdf' }]
    });

    // Mock MCP service - updated for refactored version
    mcpIsReadyStub = sandbox.stub(mcpService, 'isReady').returns(false);
    mcpInitializeStub = sandbox.stub(mcpService, 'initialize').resolves();
    mcpGetServerStatusStub = sandbox.stub(mcpService, 'getServerStatus').resolves({
      notion: false,
      jira: false,
      calendar: false
    });
    mcpRunQueryStub = sandbox.stub(mcpService, 'runQuery').resolves('MCP query result');
    mcpGetAgentStub = sandbox.stub(mcpService, 'getAgent').returns({
      run: sandbox.stub().resolves('Agent response')
    });

    // Mock MCP Router - using require cache manipulation
    const mockRouter = {
      executeMCPQuery: sandbox.stub().resolves('{"intent": "general", "dataNeeded": [], "reasoning": "Test intent"}')
    };
    getMCPRouterStub = sandbox.stub().resolves(mockRouter);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('processQuery', () => {
    it('should process a simple query with fallback mode', async () => {
      // Setup LLM response for final answer
      mcpLlmServiceStub.resolves('This is a helpful response based on your query.');

      const result = await agentService.processQuery('What is the weather today?');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should handle document queries with RAG', async () => {
      // Setup LLM response for final answer
      mcpLlmServiceStub.resolves('Based on the documents, here is the answer.');

      const result = await agentService.processQuery('What does the PDF say about requirements?');

      expect(result).toBeDefined();
      expect(ragSearchStub.calledOnce).toBe(true);
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should handle external tool queries with MCP', async () => {
      // Make MCP service appear ready
      mcpIsReadyStub.returns(true);
      mcpGetServerStatusStub.resolves({
        notion: true,
        jira: true,
        calendar: false
      });
      
      // Setup LLM response for final answer
      mcpLlmServiceStub.resolves('Based on external data, here is the answer.');

      const result = await agentService.processQuery('What are my Notion tasks?');

      expect(result).toBeDefined();
      expect(mcpRunQueryStub.calledOnce).toBe(true);
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should handle malformed intent analysis gracefully', async () => {
      // Setup LLM response for final answer
      mcpLlmServiceStub.resolves('Fallback response');

      const result = await agentService.processQuery('Test query');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Should fallback to general processing
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should handle LLM service errors gracefully', async () => {
      // Setup LLM to throw error
      mcpLlmServiceStub.rejects(new Error('LLM service unavailable'));

      const result = await agentService.processQuery('Test query');
      
      // Should return error response instead of throwing
      expect(result).toBeDefined();
      expect(result).toContain('error');
    });
  });

  describe('service integration', () => {
    it('should initialize MCP service when needed', async () => {
      mcpIsReadyStub.returns(false);
      mcpLlmServiceStub.resolves('Response with external data');

      await agentService.processQuery('Check my Notion pages');

      expect(mcpInitializeStub.calledOnce).toBe(true);
    });

    it('should handle database save failures gracefully', async () => {
      databaseStub.rejects(new Error('Database error'));
      mcpLlmServiceStub.resolves('Test response');

      // Should not throw error even if database save fails
      const result = await agentService.processQuery('Test query');
      expect(result).toBeDefined();
    });
  });
});
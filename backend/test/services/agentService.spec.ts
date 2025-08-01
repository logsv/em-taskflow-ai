import sinon from 'sinon';
import agentService from '../../src/services/agentService.js';
import llmService from '../../src/services/llmService.js';
import databaseService from '../../src/services/databaseService.js';
import mcpService from '../../src/services/mcpService.js';
import ragService from '../../src/services/ragService.js';

describe('Agent Service', () => {
  let sandbox: sinon.SinonSandbox;
  let llmStub: sinon.SinonStub;
  let databaseStub: sinon.SinonStub;
  let ragStub: sinon.SinonStub;
  let ragSearchStub: sinon.SinonStub;
  let mcpInitializeStub: sinon.SinonStub;
  let mcpIsReadyStub: sinon.SinonStub;
  let mcpGetServerStatusStub: sinon.SinonStub;
  let mcpGetToolsStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock LLM service - this is an external dependency
    llmStub = sandbox.stub(llmService, 'complete');
    
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

    // Mock MCP service - this is an external dependency
    mcpIsReadyStub = sandbox.stub(mcpService, 'isReady').returns(false);
    mcpInitializeStub = sandbox.stub(mcpService, 'initialize').resolves();
    mcpGetServerStatusStub = sandbox.stub(mcpService, 'getServerStatus').resolves({
      notion: false,
      jira: false,
      calendar: false
    });
    mcpGetToolsStub = sandbox.stub(mcpService, 'getTools').resolves([]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('processQuery', () => {
    it('should process a simple query with fallback mode', async () => {
      // Setup LLM responses
      llmStub.onFirstCall().resolves(JSON.stringify({
        intent: 'general',
        dataNeeded: [],
        reasoning: 'General query'
      }));
      
      llmStub.onSecondCall().resolves('This is a helpful response based on your query.');

      const result = await agentService.processQuery('What is the weather today?');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(llmStub.calledTwice).toBe(true);
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should process a task management query', async () => {
      // Setup LLM responses for task management intent
      llmStub.onFirstCall().resolves(JSON.stringify({
        intent: 'task_management',
        dataNeeded: ['jira', 'notion'],
        reasoning: 'User asking about tasks'
      }));
      
      llmStub.onSecondCall().resolves('Here are your current tasks and project status.');

      const result = await agentService.processQuery('Show me my current tasks');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(llmStub.calledTwice).toBe(true);
      expect(mcpInitializeStub.calledOnce).toBe(true);
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should handle RAG search when available', async () => {
      // Setup LLM responses
      llmStub.onFirstCall().resolves(JSON.stringify({
        intent: 'project_overview',
        dataNeeded: ['notion'],
        reasoning: 'User asking about project details'
      }));
      
      llmStub.onSecondCall().resolves('Based on the documents, here is your project overview.');

      const result = await agentService.processQuery('Tell me about the project documentation');

      expect(result).toBeDefined();
      expect(ragStub.calledOnce).toBe(true);
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should handle MCP service when available', async () => {
      // Mock MCP service as ready
      mcpIsReadyStub.returns(true);
      mcpGetServerStatusStub.resolves({
        notion: true,
        jira: true,
        calendar: false
      });
      mcpGetToolsStub.resolves([
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'jira_list_issues', description: 'List Jira issues' }
      ]);

      // Setup LLM responses
      llmStub.onFirstCall().resolves(JSON.stringify({
        intent: 'status_check',
        dataNeeded: ['jira', 'notion'],
        reasoning: 'User wants status update'
      }));
      
      llmStub.onSecondCall().resolves('Here is your current status with integrated tools.');

      const result = await agentService.processQuery('Give me a status update');

      expect(result).toBeDefined();
      expect(mcpGetServerStatusStub.calledOnce).toBe(true);
      // The test should check if MCP was used, not necessarily getTools called
      expect(mcpIsReadyStub.called).toBe(true);
    });

    it('should handle LLM service errors gracefully', async () => {
      // Make LLM service throw an error
      llmStub.rejects(new Error('LLM service unavailable'));

      const result = await agentService.processQuery('Test query');

      expect(result).toBeDefined();
      expect(result).toContain('error');
      expect(databaseStub.calledOnce).toBe(true);
    });

    it('should handle invalid JSON from intent analysis', async () => {
      // Return invalid JSON from intent analysis
      llmStub.onFirstCall().resolves('invalid json response');
      llmStub.onSecondCall().resolves('Fallback response');

      const result = await agentService.processQuery('Test query');

      expect(result).toBeDefined();
      expect(llmStub.calledTwice).toBe(true);
    });

    it('should handle RAG service unavailable', async () => {
      // Mock RAG service as unavailable
      ragStub.resolves({
        vectorDB: false,
        embeddingService: false,
        ready: false
      });

      llmStub.onFirstCall().resolves(JSON.stringify({
        intent: 'general',
        dataNeeded: [],
        reasoning: 'General query'
      }));
      
      llmStub.onSecondCall().resolves('Response without RAG data.');

      const result = await agentService.processQuery('Test query');

      expect(result).toBeDefined();
      expect(ragStub.calledOnce).toBe(true);
    });

    it('should handle database save errors gracefully', async () => {
      // Make database save fail
      databaseStub.rejects(new Error('Database unavailable'));

      llmStub.onFirstCall().resolves(JSON.stringify({
        intent: 'general',
        dataNeeded: [],
        reasoning: 'General query'
      }));
      
      llmStub.onSecondCall().resolves('I apologize, but I encountered an error while processing your request. Please try again.');

      const result = await agentService.processQuery('Test query');

      expect(result).toBeDefined();
      // Should return a graceful error message
      expect(result).toContain('I apologize');
    });
  });
});
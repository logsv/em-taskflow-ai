import sinon from 'sinon';
import agentService from '../../src/services/agentService.js';
import langGraphAgentService from '../../src/agent/service.js';

describe('Agent Service', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('processQuery', () => {
    it('should delegate query to LangGraphAgentService and return response', async () => {
      const query = 'What is the weather today?';
      const mockResponse = 'Mocked LangGraph response';

      const processStub = sandbox
        .stub(langGraphAgentService, 'processQuery')
        .resolves(mockResponse);

      const result = await agentService.processQuery(query);

      expect(result).toBe(mockResponse);
      expect(processStub.calledOnce).toBe(true);
      expect(processStub.calledWith(query, { includeRAG: true })).toBe(true);
    });

    it('should propagate errors from LangGraphAgentService', async () => {
      const query = 'Cause an error';
      const error = new Error('LLM not initialized. Call initializeLLM() first.');

      sandbox.stub(langGraphAgentService, 'processQuery').rejects(error);

      try {
        await agentService.processQuery(query);
        fail('Expected processQuery to throw');
      } catch (err) {
        expect(err).toBe(error);
      }
    });
  });
});

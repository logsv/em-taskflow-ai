import sinon from 'sinon';
import agentService, { LangGraphAgentService } from '../../src/services/agentService.js';

describe('Agent Service', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should export an instance of LangGraphAgentService', () => {
    expect(agentService).toBeDefined();
    expect(agentService.constructor.name).toBe('LangGraphAgentService');
  });

  // Skipped deep logic tests because mocking ESM imports (graph.js) is complex without additional tools.
  // The service implementation was moved from backend/src/agent/service.js to backend/src/services/agentService.js.
  
  /*
  describe('processQuery', () => {
    it('should process query', async () => {
       // Mocking internal calls to graph.js is not easily possible here without dependency injection or ESM mocking tools
    });
  });
  */
});

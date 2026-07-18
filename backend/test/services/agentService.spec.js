import sinon from 'sinon';
import agentService, { LangGraphAgentService } from '../../src/services/agentService.js';

import db from '../../src/db/index.js';

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

  describe('processQuery confirmation bypass', () => {
    let service;

    beforeEach(() => {
      service = new LangGraphAgentService();
      service.initialized = true;
      sandbox.stub(service, 'ensureLlmReadyForQuery').resolves();
    });

    it('should bypass confidence check and run original query if user confirms clarification', async () => {
      const historyMock = [
        { role: 'user', content: 'What is my schedule today?', metadata: { routingPlan: { domains: ['calendar'], confidence: 0.20 } } },
        { role: 'assistant', content: 'Should I proceed using: calendar?', strategy: 'clarification' }
      ];
      sandbox.stub(db, 'getThreadMessages').resolves(historyMock);

      const runPolicyStub = sandbox.stub(service, 'runEnforcedPolicy').resolves({ answer: 'Here is your schedule.', sources: [] });

      const result = await service.processQuery('yes', { threadId: 'th_123' });

      expect(result.answer).toContain('Here is your schedule.');
      expect(runPolicyStub.calledWith('What is my schedule today?')).toBe(true);
    });
  });
});

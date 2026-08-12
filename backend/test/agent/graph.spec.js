import sinon from 'sinon';
import { expect } from 'chai';
import { initializeAgent, executeAgentQuery, resetAgent } from '../../src/agent/graph.js';

describe('Agent Graph', () => {
  let sandbox;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    await resetAgent();
  });

  afterEach(async () => {
    sandbox.restore();
    await resetAgent();
  });

  it('should initialize the agent without errors', async () => {
    const mockLlm = {
      bind: function() { return this; },
      bindTools: function() { return this; },
      invoke: sandbox.stub().resolves({ content: '', tool_calls: [] }),
    };
    const mockAgent = { name: 'mock_agent' };
    const mockCompile = sandbox.stub().returns({});

    await initializeAgent({
      llm: mockLlm,
      deliveryAgent: mockAgent,
      doraAgent: mockAgent,
      sprintAgent: mockAgent,
      roadmapAgent: mockAgent,
      createSupervisor: () => ({ compile: mockCompile }),
      skipMcpInit: true,
    });

    expect(mockCompile.calledOnce).to.be.true;
  }, 10000);

  it('should execute a query and return evidence and response', async () => {
    const mockSupervisor = {
      invoke: sandbox.stub().resolves({
        messages: [
          {
            role: 'assistant',
            content: 'This is a test summary response.',
            tool_calls: [{ name: 'transfer_to_delivery_agent' }],
          },
        ],
        evidence: { delivery: ['Test evidence'] },
      }),
    };

    const mockLlm = {
      bind: function() { return this; },
      bindTools: function() { return this; },
      invoke: sandbox.stub().resolves({ content: '', tool_calls: [] }),
    };
    const mockAgent = { name: 'mock_agent' };

    await initializeAgent({
      llm: mockLlm,
      deliveryAgent: mockAgent,
      doraAgent: mockAgent,
      sprintAgent: mockAgent,
      roadmapAgent: mockAgent,
      createSupervisor: () => mockSupervisor,
      skipMcpInit: true,
    });

    const result = await executeAgentQuery('Show me open delivery bottlenecks.', {
      routingPlan: { domains: ['delivery'], allow_rag: false },
    });

    expect(result).to.have.property('response', 'This is a test summary response.');
    expect(result.evidence).to.have.property('delivery');
    expect(result.evidence.delivery[0]).to.equal('Test evidence');
    expect(mockSupervisor.invoke.calledOnce).to.be.true;
  }, 10000);
});

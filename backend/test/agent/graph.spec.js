import sinon from 'sinon';
import { expect } from 'chai';
import { initializeAgent, executeAgentQuery, resetAgent } from '../../src/agent/graph.js';

describe('Agent Graph', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(async () => {
    sandbox.restore();
    await resetAgent();
  });

  it('should initialize the agent without errors', async () => {
    const mockLlm = {
      bind: () => ({ bindTools: () => {} }),
      bindTools: () => {},
    };
    const mockAgent = {};
    const mockCompile = sandbox.stub().returns({});

    await initializeAgent({
      llm: mockLlm,
      jiraAgent: mockAgent,
      githubAgent: mockAgent,
      notionAgent: mockAgent,
      calendarAgent: mockAgent,
      ragAgent: mockAgent,
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
            tool_calls: [{ name: 'transfer_to_jira_agent' }],
          },
        ],
        evidence: { jira: ['Test evidence'] },
      }),
    };

    const mockLlm = {
      bind: () => ({ bindTools: () => {} }),
      bindTools: () => {},
    };
    const mockAgent = {};

    await initializeAgent({
      llm: mockLlm,
      jiraAgent: mockAgent,
      githubAgent: mockAgent,
      notionAgent: mockAgent,
      calendarAgent: mockAgent,
      ragAgent: mockAgent,
      createSupervisor: () => mockSupervisor,
      skipMcpInit: true,
    });

    const result = await executeAgentQuery('Show me open Jira issues.', {
      routingPlan: { domains: ['jira'], allow_rag: false },
    });

    expect(result).to.have.property('response', 'This is a test summary response.');
    expect(result.evidence).to.have.property('jira');
    expect(result.evidence.jira[0]).to.equal('Test evidence');
    expect(mockSupervisor.invoke.calledOnce).to.be.true;
  }, 10000);
});

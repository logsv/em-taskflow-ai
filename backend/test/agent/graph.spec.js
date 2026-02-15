import sinon from 'sinon';
import { expect } from 'chai';
import * as llm from '../../src/llm/index.js';
import * as mcp from '../../src/mcp/index.js';
import * as supervisor from '@langchain/langgraph-supervisor';
import * as jiraAgent from '../../src/agent/jiraAgent.js';
import * as githubAgent from '../../src/agent/githubAgent.js';
import * as notionAgent from '../../src/agent/notionAgent.js';
import * as calendarAgent from '../../src/agent/calendarAgent.js';
import * as ragAgent from '../../src/agent/ragAgent.js';
import * as llmRouter from '../../src/agent/llmRouter.js';
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
    // Mock all the dependencies to avoid actual initialization
    sandbox.stub(llm, 'getChatModel').returns({
      bind: () => ({ bindTools: () => {} }),
      bindTools: () => {},
    });
    sandbox.stub(mcp, 'isMCPReady').returns(true);
    sandbox.stub(mcp, 'getJiraMCPTools').returns([]);
    sandbox.stub(mcp, 'getGithubMCPTools').returns([]);
    sandbox.stub(mcp, 'getNotionMCPTools').returns([]);
    sandbox.stub(mcp, 'getGoogleMCPTools').returns([]);
    sandbox.stub(mcp, 'getRAGMCPTools').returns([]);
    sandbox.stub(supervisor, 'createSupervisor').returns({ compile: () => ({}) });
    sandbox.stub(jiraAgent, 'createJiraAgent').resolves({});
    sandbox.stub(githubAgent, 'createGithubAgent').resolves({});
    sandbox.stub(notionAgent, 'createNotionAgent').resolves({});
    sandbox.stub(calendarAgent, 'createCalendarAgent').resolves({});
    sandbox.stub(ragAgent, 'createRagAgent').resolves({});

    let error = null;
    try {
      await initializeAgent();
    } catch (e) {
      error = e;
    }

    expect(error).to.be.null;
  }).timeout(10000);

  it('should execute a query and return a valid JSON output', async () => {
    const mockRouterChain = {
      invoke: sandbox.stub().resolves({
        domains: ['jira'],
        must_use_tools: true,
        allow_rag: false,
        confidence: 0.9,
        reasoning_summary: 'User is asking for Jira tickets.',
      }),
    };

    const mockSupervisor = {
      invoke: sandbox.stub().resolves({
        messages: [
          {
            role: 'assistant',
            content: JSON.stringify({
              executiveSummary: 'This is a test summary.',
              keyRisksAndBlockers: [],
              whatNeedsDecision: [],
              actionItems: [],
              evidenceBySource: { jira: 'Some evidence from Jira.' },
            }),
            tool_calls: [{ name: 'jira_tool' }],
          },
        ],
      }),
    };

    // Mock dependencies for initialization
    sandbox.stub(llm, 'getChatModel').returns({
        bind: () => ({ bindTools: () => {} }),
        bindTools: () => {},
    });
    sandbox.stub(mcp, 'isMCPReady').returns(true);
    sandbox.stub(mcp, 'getJiraMCPTools').returns([{ name: 'jira_tool' }]);
    sandbox.stub(mcp, 'getGithubMCPTools').returns([]);
    sandbox.stub(mcp, 'getNotionMCPTools').returns([]);
    sandbox.stub(mcp, 'getGoogleMCPTools').returns([]);
    sandbox.stub(mcp, 'getRAGMCPTools').returns([]);
    sandbox.stub(supervisor, 'createSupervisor').returns({ compile: () => mockSupervisor });
    sandbox.stub(jiraAgent, 'createJiraAgent').resolves({});
    sandbox.stub(githubAgent, 'createGithubAgent').resolves({});
    sandbox.stub(notionAgent, 'createNotionAgent').resolves({});
    sandbox.stub(calendarAgent, 'createCalendarAgent').resolves({});
    sandbox.stub(ragAgent, 'createRagAgent').resolves({});
    sandbox.stub(llmRouter, 'getRouterChain').returns(mockRouterChain);

    await initializeAgent();
    const result = await executeAgentQuery('Show me my open Jira tickets.');

    expect(result).to.have.property('executiveSummary', 'This is a test summary.');
    expect(mockRouterChain.invoke.calledOnce).to.be.true;
    expect(mockSupervisor.invoke.calledOnce).to.be.true;
  }).timeout(10000);
});

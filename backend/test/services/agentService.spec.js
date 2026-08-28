import sinon from 'sinon';
import agentService, { LangGraphAgentService } from '../../src/services/agentService.js';
import { doraMetricsTool } from '../../src/agent/doraAgent.js';
import { deliveryBottlenecksTool } from '../../src/agent/deliveryAgent.js';
import { sbiFeedbackTool } from '../../src/agent/sbiAgent.js';

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

    it('should execute single-domain direct dispatch for SBI coaching', async () => {
      const routingPlan = { domains: ['sbi'], must_use_tools: true, allow_rag: false, confidence: 0.95 };
      sandbox.stub(service, 'routeQueryPlan').resolves(routingPlan);
      sandbox.stub(sbiFeedbackTool, 'invoke').resolves({
        status: 'SUCCESS',
        name: 'format_sbi_feedback',
        data: {
          summary: '### 🎯 Situation-Behavior-Impact (SBI) Feedback: eng_alex',
        }
      });

      const result = await service.processQuery('Draft an SBI coaching feedback for an engineer unblocking code reviews', { threadId: 'th_sbi' });

      expect(result.answer).toBeDefined();
      expect(result.answer).toContain('Situation-Behavior-Impact');
      expect(result.meta.decision.selectedPath).toBe('direct-domain-executor');
    });

    it('should execute parallel multi-agent orchestrator for composite queries', async () => {
      const routingPlan = { domains: ['dora', 'delivery', 'sbi'], must_use_tools: true, allow_rag: false, confidence: 0.95 };
      sandbox.stub(service, 'routeQueryPlan').resolves(routingPlan);
      sandbox.stub(doraMetricsTool, 'invoke').resolves({
        status: 'SUCCESS',
        name: 'calculate_dora_metrics',
        data: { summary: '### 📊 DORA Metrics Scorecard: Elite Performance' }
      });
      sandbox.stub(deliveryBottlenecksTool, 'invoke').resolves({
        status: 'SUCCESS',
        name: 'analyze_delivery_bottlenecks',
        data: { summary: '### 🚀 Delivery Bottleneck Analysis: 0 Blockers' }
      });
      sandbox.stub(sbiFeedbackTool, 'invoke').resolves({
        status: 'SUCCESS',
        name: 'format_sbi_feedback',
        data: { summary: '### 🎯 Situation-Behavior-Impact Feedback' }
      });

      const result = await service.processQuery('Evaluate team health: calculate DORA metrics, check delivery bottlenecks, and draft an SBI feedback', { threadId: 'th_multi' });

      expect(result.answer).toBeDefined();
      expect(result.meta.decision.selectedPath).toBe('parallel-multi-agent-orchestrator');
      expect(result.meta.decision.toolsUsed.length).toBeGreaterThanOrEqual(2);
    });

    it('should return structured onboarding guidance for zero-hit RAG queries', async () => {
      const routingPlan = { domains: ['rag'], must_use_tools: false, allow_rag: true, confidence: 0.95 };
      sandbox.stub(service, 'routeQueryPlan').resolves(routingPlan);
      sandbox.stub(service, 'tryRag').resolves({ answer: '', sources: [] });

      const result = await service.processQuery('Search internal engineering documentation and uploaded PDFs for architecture guidelines', { threadId: 'th_rag' });

      expect(result.answer).toContain('Knowledge Base Search');
      expect(result.answer).toContain('No matching document chunks found');
      expect(result.meta.decision.selectedPath).toBe('rag-zero-hit-guidance');
    });
  });

});


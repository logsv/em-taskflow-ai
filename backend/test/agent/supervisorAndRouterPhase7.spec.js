import { classifyFastPath } from '../../src/agent/llmRouter.js';
import { supervisorPostModelHook, supervisorPreModelHook } from '../../src/agent/graph.js';
import { optimizeChatHistory } from '../../src/application/chat/ChatApplicationService.js';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

describe('Phase 7 Specs: LangGraph Supervisor Routing, Control Flow & Guardrails', () => {
  describe('LLM Pre-Router Fast Classifier (classifyFastPath)', () => {
    it('should route attachment queries directly to ATTACHMENT_DIRECT fast-path', () => {
      const res = classifyFastPath('[attachment: resume.pdf]\n# document executive context:\nSample text', {});
      expect(res).toBeDefined();
      expect(res.intent_type).toBe('ATTACHMENT_DIRECT');
      expect(res.must_use_tools).toBe(false);
    });

    it('should bypass fast-path for domain queries containing DORA/SOP/OKR keywords', () => {
      expect(classifyFastPath('What is our DORA lead time rating?', {})).toBeNull();
      expect(classifyFastPath('Audit PR compliance against SOP-01', {})).toBeNull();
      expect(classifyFastPath('Check Q3 OKR progress', {})).toBeNull();
    });

    it('should route greetings and pure code requests to fast-path', () => {
      const res = classifyFastPath('hello there', {});
      expect(res).toBeDefined();
      expect(res.intent_type).toBe('DIRECT_LLM');
    });
  });

  describe('Supervisor Policy Guardrails (supervisorPostModelHook)', () => {
    it('should intercept repeated worker handoff loops after worker execution', () => {
      const state = {
        routingPlan: { domains: ['github'] },
        messages: [
          new HumanMessage('Show my open PRs'),
          new AIMessage({
            content: 'Found 2 open PRs',
            name: 'dora_agent',
          }),
          new AIMessage({
            content: '',
            tool_calls: [{ name: 'transfer_to_dora_agent', args: {}, id: 'call_1' }],
          }),
        ],
      };

      const result = supervisorPostModelHook(state);
      expect(result.messages).toBeDefined();
      expect(result.messages[0].tool_calls.length).toBe(0);
    });

    it('should block handoffs to unauthorized domains', () => {
      const state = {
        routingPlan: { domains: ['dora'] },
        messages: [
          new HumanMessage('Show DORA metrics'),
          new AIMessage({
            content: '',
            tool_calls: [{ name: 'transfer_to_jira_agent', args: {}, id: 'call_2' }],
          }),
        ],
      };

      const result = supervisorPostModelHook(state);
      expect(result.messages).toBeDefined();
      expect(result.messages[0].content).toContain('No tool evidence was found');
    });
  });

  describe('Chat History Sliding Window & Anchoring (optimizeChatHistory)', () => {
    it('should maintain active 8 turns verbatim and anchor older turns in summary block', () => {
      const messages = Array.from({ length: 14 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Turn ${i + 1} message content`,
      }));

      const optimized = optimizeChatHistory(messages, 8);
      expect(optimized.length).toBeLessThanOrEqual(10);
      expect(optimized[0].role).toBe('system');
      expect(optimized[0].content).toContain('Conversation Summary Anchor');
    });
  });
});

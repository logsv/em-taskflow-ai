import { expect } from 'chai';
import { supervisorPreModelHook, supervisorPostModelHook } from '../../src/agent/graph.js';
import { sanitizeToolInput, wrapToolForResiliency } from '../../src/mcp/index.js';

describe('Supervisor & Worker Hooks + Tool Sanitizer Unit Tests', () => {
  describe('supervisorPreModelHook', () => {
    it('should inject initial delegation instruction when no worker has executed', () => {
      const state = {
        messages: [{ role: 'user', content: 'What should I focus on today?' }],
        routingPlan: { domains: ['github'], allow_rag: false },
      };

      const result = supervisorPreModelHook(state);
      expect(result).to.have.property('llmInputMessages');
      const injectedSystemMsg = result.llmInputMessages.find(
        (m) => typeof m.content === 'string' && m.content.includes('Active Routing Plan Policy')
      );
      expect(injectedSystemMsg).to.exist;
      expect(injectedSystemMsg.content).to.include('Delegate to authorized worker domains');
    });

    it('should instruct supervisor to STOP delegating once a worker has executed', () => {
      const state = {
        messages: [
          { role: 'user', content: 'What should I focus on today?' },
          { name: 'github_agent', content: 'Here are the open issue findings...' },
        ],
        routingPlan: { domains: ['github'], allow_rag: false },
      };

      const result = supervisorPreModelHook(state);
      const injectedSystemMsg = result.llmInputMessages.find(
        (m) => typeof m.content === 'string' && m.content.includes('STOP DELEGATING')
      );
      expect(injectedSystemMsg).to.exist;
      expect(injectedSystemMsg.content).to.include('A worker specialist has ALREADY returned evidence');
    });
  });

  describe('supervisorPostModelHook', () => {
    it('should block repeated transfer_to_ handoffs after worker execution', () => {
      const state = {
        messages: [
          { role: 'user', content: 'Check open issues' },
          { name: 'github_agent', content: 'Issue findings...' },
          {
            role: 'assistant',
            id: 'msg-123',
            tool_calls: [{ name: 'transfer_to_github_agent', args: {} }],
          },
        ],
        routingPlan: { domains: ['github'], allow_rag: false },
      };

      const result = supervisorPostModelHook(state);
      expect(result).to.have.property('messages');
      expect(result.messages[0].content).to.match(/Issue findings|Workspace findings/);
    });
  });

  describe('sanitizeToolInput', () => {
    it('should clean string nulls, empty strings, and coerce numeric parameters', () => {
      const rawInput = {
        query: 'is:open',
        owner: 'null',
        repo: '',
        page: '1',
        perPage: '100',
        order: null,
      };

      const clean = sanitizeToolInput(rawInput);
      expect(clean).to.deep.equal({
        query: 'is:open',
        page: 1,
        perPage: 100,
      });
    });

    it('should sanitize input transparently via wrapToolForResiliency', async () => {
      let passedInput = null;
      const mockTool = {
        name: 'test_tool',
        invoke: async (input) => {
          passedInput = input;
          return 'ok';
        },
      };

      const wrapped = wrapToolForResiliency(mockTool);
      await wrapped.invoke({ query: 'test', page: '2', owner: 'undefined' });

      expect(passedInput).to.deep.equal({
        query: 'test',
        page: 2,
      });
    });
  });
});

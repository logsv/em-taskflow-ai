import { optimizeChatHistory } from '../../src/application/chat/ChatApplicationService.js';

describe('Chat History Pre-LLM Optimization', () => {
  it('should return raw messages when count is less than threshold', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const result = optimizeChatHistory(messages, 8);
    expect(result.length).toBe(2);
    expect(result[0].content).toBe('Hello');
  });

  it('should apply sliding window and state summary anchor when messages exceed threshold', () => {
    const messages = [];
    for (let i = 1; i <= 15; i++) {
      messages.push({ role: 'user', content: `Query number ${i}` });
      messages.push({ role: 'assistant', content: `Response number ${i}` });
    }
    // Total 30 messages
    const result = optimizeChatHistory(messages, 8);

    // Should return 1 system anchor + 8 active messages = 9
    expect(result.length).toBe(9);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('[System Memory: Conversation Summary Anchor]');
    expect(result[0].content).toContain('22 earlier turns archived');

    // Last message should be response 15
    expect(result[8].content).toBe('Response number 15');
  });
});

import { ChatApplicationService } from '../../src/application/chat/ChatApplicationService.js';

describe('ChatApplicationService', () => {
  it('processes chat, persists both messages, and returns normalized response data', async () => {
    const dbService = {
      ensureThread: jasmine.createSpy('ensureThread').and.resolveTo({ id: 'th_123' }),
      saveMessage: jasmine.createSpy('saveMessage')
        .and.resolveTo({ id: 11 })
        .and.resolveTo({ id: 12 }),
    };
    const agent = {
      processQuery: jasmine.createSpy('processQuery').and.resolveTo({
        answer: 'Grounded answer',
        sources: [
          {
            pageContent: 'Chunk text',
            metadata: { filename: 'doc.pdf', chunkIndex: 0 },
          },
        ],
        meta: {
          traceId: 'trace_123',
          decision: {
            selectedPath: 'llm-only',
            routingPlan: { domains: [] },
          },
        },
      }),
    };
    const service = new ChatApplicationService({
      dbService,
      agent,
      notionOAuth: {
        start: async () => null,
        status: async () => ({ authorized: true }),
      },
      githubOAuth: {
        start: async () => null,
        status: async () => ({ authorized: true }),
      },
    });

    const result = await service.processChat({
      message: 'Hello',
      sessionContext: {
        sessionId: 'sess_123',
        threadId: 'th_123',
      },
      requestId: 'req_123',
      ragMode: 'baseline',
    });

    expect(dbService.ensureThread).toHaveBeenCalledWith('th_123', 'Hello', 'sess_123');
    expect(agent.processQuery).toHaveBeenCalledWith('Hello', jasmine.objectContaining({
      threadId: 'th_123',
      sessionId: 'sess_123',
      userId: 'user_logsv',
      ragMode: 'baseline',
    }));
    expect(dbService.saveMessage.calls.count()).toBe(2);
    expect(result.messageId).toBe(12);
    expect(result.threadId).toBe('th_123');
    expect(result.sessionId).toBe('sess_123');
    expect(result.answer).toBe('Grounded answer');
    expect(result.traceId).toBe('trace_123');
    expect(result.sources.length).toBe(1);
    expect(result.feedbackToken).toBe(12);
  });

  it('rewrites answer when GitHub OAuth is required for a GitHub-routed request', async () => {
    const dbService = {
      ensureThread: jasmine.createSpy('ensureThread').and.resolveTo({ id: 'th_999' }),
      saveMessage: jasmine.createSpy('saveMessage')
        .and.resolveTo({ id: 21 })
        .and.resolveTo({ id: 22 }),
    };
    const agent = {
      processQuery: jasmine.createSpy('processQuery').and.resolveTo({
        answer: 'Original answer',
        sources: [],
        meta: {
          decision: {
            selectedPath: 'router+supervisor',
            routingPlan: { domains: ['github'] },
          },
        },
      }),
    };
    const service = new ChatApplicationService({
      dbService,
      agent,
      notionOAuth: {
        start: async () => null,
        status: async () => ({ authorized: true }),
      },
      githubOAuth: {
        start: async () => null,
        status: async () => ({ authorized: false, pendingAuthorizationUrl: 'https://example.test/github-auth' }),
      },
    });

    const result = await service.processChat({
      message: 'Show my PRs',
      sessionContext: {
        sessionId: 'sess_123',
        threadId: 'th_999',
      },
      requestId: 'req_456',
    });

    expect(result.answer).toContain('GitHub connection is required');
    expect(result.meta.githubOAuth.required).toBe(true);
    expect(result.meta.githubOAuth.authorizationUrl).toBe('https://example.test/github-auth');
  });
});

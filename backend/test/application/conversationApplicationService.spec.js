import { ConversationApplicationService } from '../../src/application/conversation/ConversationApplicationService.js';

describe('ConversationApplicationService', () => {
  it('lists threads and returns the normalized payload', async () => {
    const dbService = {
      listThreads: jasmine.createSpy('listThreads').and.resolveTo([
        { id: 'th_1', title: 'First thread' },
        { id: 'th_2', title: 'Second thread' },
      ]),
    };
    const service = new ConversationApplicationService({ dbService });

    const result = await service.listThreads({
      limit: 20,
      requestId: 'req_threads',
    });

    expect(dbService.listThreads).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      threads: [
        { id: 'th_1', title: 'First thread' },
        { id: 'th_2', title: 'Second thread' },
      ],
      requestId: 'req_threads',
    });
  });

  it('returns thread messages with thread id and request id', async () => {
    const dbService = {
      getThreadMessages: jasmine.createSpy('getThreadMessages').and.resolveTo([
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi there' },
      ]),
    };
    const service = new ConversationApplicationService({ dbService });

    const result = await service.getThreadMessages({
      threadId: 'th_123',
      limit: 75,
      requestId: 'req_messages',
    });

    expect(dbService.getThreadMessages).toHaveBeenCalledWith('th_123', 75);
    expect(result).toEqual({
      threadId: 'th_123',
      messages: [
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi there' },
      ],
      requestId: 'req_messages',
    });
  });
});

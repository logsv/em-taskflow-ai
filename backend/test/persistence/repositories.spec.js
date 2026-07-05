import { SessionRepository } from '../../src/persistence/session/SessionRepository.js';
import { ThreadRepository } from '../../src/persistence/thread/ThreadRepository.js';
import { MessageRepository } from '../../src/persistence/message/MessageRepository.js';
import { FeedbackRepository } from '../../src/persistence/feedback/FeedbackRepository.js';

describe('Persistence repositories', () => {
  it('SessionRepository delegates to the underlying db service', async () => {
    const dbService = {
      getSession: jasmine.createSpy('getSession').and.resolveTo({ id: 'sess_1' }),
      createSession: jasmine.createSpy('createSession').and.resolveTo({ id: 'sess_2' }),
      touchSession: jasmine.createSpy('touchSession').and.resolveTo(),
      getOrCreateActiveThread: jasmine.createSpy('getOrCreateActiveThread').and.resolveTo({ id: 'th_1' }),
    };
    const repo = new SessionRepository({ dbService });

    await repo.getSession('sess_1');
    await repo.createSession({ userAgent: 'ua' });
    await repo.touchSession('sess_1');
    await repo.getOrCreateActiveThread('sess_1');

    expect(dbService.getSession).toHaveBeenCalledWith('sess_1');
    expect(dbService.createSession).toHaveBeenCalledWith({ userAgent: 'ua' });
    expect(dbService.touchSession).toHaveBeenCalledWith('sess_1');
    expect(dbService.getOrCreateActiveThread).toHaveBeenCalledWith('sess_1');
  });

  it('ThreadRepository and MessageRepository delegate thread and message operations', async () => {
    const dbService = {
      ensureThread: jasmine.createSpy('ensureThread').and.resolveTo({ id: 'th_1' }),
      listThreads: jasmine.createSpy('listThreads').and.resolveTo([]),
      saveMessage: jasmine.createSpy('saveMessage').and.resolveTo({ id: 7 }),
      getThreadMessages: jasmine.createSpy('getThreadMessages').and.resolveTo([]),
    };
    const threadRepo = new ThreadRepository({ dbService });
    const messageRepo = new MessageRepository({ dbService });

    await threadRepo.ensureThread('th_1', 'Hello', 'sess_1');
    await threadRepo.listThreads(25);
    await messageRepo.saveMessage({ threadId: 'th_1', role: 'user', content: 'Hi' });
    await messageRepo.getThreadMessages('th_1', 25);

    expect(dbService.ensureThread).toHaveBeenCalledWith('th_1', 'Hello', 'sess_1');
    expect(dbService.listThreads).toHaveBeenCalledWith(25);
    expect(dbService.saveMessage).toHaveBeenCalledWith({ threadId: 'th_1', role: 'user', content: 'Hi' });
    expect(dbService.getThreadMessages).toHaveBeenCalledWith('th_1', 25);
  });

  it('FeedbackRepository delegates feedback creation', async () => {
    const dbService = {
      createFeedback: jasmine.createSpy('createFeedback').and.resolveTo({ id: 'fb_1' }),
    };
    const repo = new FeedbackRepository({ dbService });

    await repo.createFeedback({ score: 'thumbs_up' });

    expect(dbService.createFeedback).toHaveBeenCalledWith({ score: 'thumbs_up' });
  });
});

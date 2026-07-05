import { LegacyPreferenceRepository } from '../../src/persistence/legacy/LegacyPreferenceRepository.js';
import { LegacyChatHistoryRepository } from '../../src/persistence/legacy/LegacyChatHistoryRepository.js';
import { LegacyTaskCacheRepository } from '../../src/persistence/legacy/LegacyTaskCacheRepository.js';

describe('Legacy persistence repositories', () => {
  it('LegacyPreferenceRepository delegates get/set to the db service', async () => {
    const dbService = {
      getUserPreference: jasmine.createSpy('getUserPreference').and.resolveTo({ token: 'abc' }),
      setUserPreference: jasmine.createSpy('setUserPreference').and.resolveTo(),
    };
    const repo = new LegacyPreferenceRepository({ dbService });

    await repo.get('oauth.tokens');
    await repo.set('oauth.tokens', { token: 'abc' });

    expect(dbService.getUserPreference).toHaveBeenCalledWith('oauth.tokens');
    expect(dbService.setUserPreference).toHaveBeenCalledWith('oauth.tokens', { token: 'abc' });
  });

  it('LegacyChatHistoryRepository delegates save/list to the db service', async () => {
    const dbService = {
      saveChatHistory: jasmine.createSpy('saveChatHistory').and.resolveTo({ id: 1 }),
      getChatHistory: jasmine.createSpy('getChatHistory').and.resolveTo([]),
    };
    const repo = new LegacyChatHistoryRepository({ dbService });

    await repo.save('hello', 'hi', 'sess_1', { source: 'legacy' });
    await repo.list(10, 'sess_1');

    expect(dbService.saveChatHistory).toHaveBeenCalledWith('hello', 'hi', 'sess_1', { source: 'legacy' });
    expect(dbService.getChatHistory).toHaveBeenCalledWith(10, 'sess_1');
  });

  it('LegacyTaskCacheRepository delegates set/get to the db service', async () => {
    const dbService = {
      cacheTaskData: jasmine.createSpy('cacheTaskData').and.resolveTo({ id: 2 }),
      getCachedTaskData: jasmine.createSpy('getCachedTaskData').and.resolveTo([]),
    };
    const repo = new LegacyTaskCacheRepository({ dbService });

    await repo.set('jira', 'task-1', { title: 'Fix bug' });
    await repo.get('jira', 1800);

    expect(dbService.cacheTaskData).toHaveBeenCalledWith('jira', 'task-1', { title: 'Fix bug' });
    expect(dbService.getCachedTaskData).toHaveBeenCalledWith('jira', 1800);
  });
});

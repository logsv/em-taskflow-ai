import { LegacyPreferenceRepository } from '../../src/persistence/legacy/LegacyPreferenceRepository.js';

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

});

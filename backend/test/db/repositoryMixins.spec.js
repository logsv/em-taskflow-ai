import db from '../../src/db/postgres.js';
import { applyMixins } from '../../src/db/repositories/mixin.js';

describe('DatabaseService repository mixins', () => {
  it('exposes the repository methods callers use on the one db object', () => {
    for (const name of [
      'createSession', 'saveMessagePair', 'getThreadMessages', // chat
      'upsertGithubIssues', 'getGithubIssues', // github
      'getDoraSnapshots', 'getOkrRecords', 'purgeSeededPlaceholderOkrs', // metrics
      'setAppSettings', 'getAllAppSettings', // settings
      'upsertTeamMember', 'getTeamMembers', // team
      'recordAuditRun', 'listActionItems', // audit
      'withTransaction', 'createTables', // core
    ]) {
      expect(typeof db[name]).withContext(name).toBe('function');
    }
  });

  it('refuses two repositories defining the same method', () => {
    class Target {}
    class A { m() {} }
    class B { m() {} }
    expect(() => applyMixins(Target, A, B)).toThrowError(/defined twice/);
  });
});

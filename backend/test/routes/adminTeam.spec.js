import identityService from '../../src/services/identityService.js';
import databaseService from '../../src/db/postgres.js';

describe('Admin Team Members Service & Identity Management', () => {
  let savedEnv;

  beforeEach(async () => {
    savedEnv = { ...process.env };
    databaseService.inMemoryTeamMembers = [];
    identityService.cachedMembers = [];
  });

  afterEach(async () => {
    databaseService.inMemoryTeamMembers = [];
    identityService.cachedMembers = [];
    process.env = savedEnv;
  });

  it('should auto-populate baseline when team roster is empty', async () => {
    const syncRes = await identityService.autoDiscoverAndSync({ seedFixtures: true });

    expect(syncRes.syncedCount).toBeGreaterThanOrEqual(3);
    const members = await identityService.getAllMembers();
    expect(members.length).toBeGreaterThanOrEqual(3);
    expect(members.some((m) => m.displayName === 'Alex Williams')).toBe(true);
    expect(members.some((m) => m.displayName === 'Sarah Chen')).toBe(true);
    expect(members.some((m) => m.displayName === 'Taylor Morgan')).toBe(true);
  });

  it('should create a new team member and persist in database', async () => {
    const saved = await databaseService.upsertTeamMember({
      displayName: 'Elena Rostova',
      email: 'elena.r@company.internal',
      aliases: ['Elena', 'elena-r'],
      githubUsername: 'elena-r',
      jiraEmail: 'elena.r@company.internal',
      currentLevel: 'L5_SENIOR',
      targetLevel: 'L6_STAFF',
      track: 'INDIVIDUAL_CONTRIBUTOR',
      tenureMonths: 24,
    });

    expect(saved).toBeDefined();
    expect(saved.displayName).toBe('Elena Rostova');
    expect(saved.githubUsername).toBe('elena-r');
    expect(saved.track).toBe('INDIVIDUAL_CONTRIBUTOR');

    const lookup = await identityService.resolveMember('Elena');
    expect(lookup).toBeDefined();
    expect(lookup.displayName).toBe('Elena Rostova');
    expect(lookup.githubUsername).toBe('elena-r');
  });

  it('should update existing member level and aliases', async () => {
    const saved = await databaseService.upsertTeamMember({
      id: 'mem_marcus',
      displayName: 'Marcus Brody',
      email: 'marcus.b@company.internal',
      currentLevel: 'L4_MID',
    });

    const updated = await databaseService.upsertTeamMember({
      id: saved.id,
      displayName: 'Marcus Brody',
      email: 'marcus.b@company.internal',
      currentLevel: 'L5_SENIOR',
      aliases: ['Marcus', 'mbrody', 'eng_marcus'],
    });

    expect(updated.currentLevel).toBe('L5_SENIOR');
    expect(updated.aliases).toContain('mbrody');

    const resolved = await identityService.resolveMember('mbrody');
    expect(resolved).toBeDefined();
    expect(resolved.displayName).toBe('Marcus Brody');
  });

  it('should remove a team member', async () => {
    const saved = await databaseService.upsertTeamMember({
      id: 'mem_temp_del',
      displayName: 'Temporary Dev',
      email: 'temp.dev@company.internal',
    });

    expect(await databaseService.getTeamMemberById('mem_temp_del')).toBeDefined();

    await databaseService.deleteTeamMember('mem_temp_del');
    expect(await databaseService.getTeamMemberById('mem_temp_del')).toBeNull();
  });
});

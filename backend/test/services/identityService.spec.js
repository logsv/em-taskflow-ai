import identityService from '../../src/services/identityService.js';
import settingsService from '../../src/services/settingsService.js';
import databaseService from '../../src/db/postgres.js';

describe('IdentityService & Cross-Platform Team Auto-Discovery', () => {
  let savedEnv;

  beforeEach(async () => {
    savedEnv = { ...process.env };
    delete process.env.PRIMARY_ADMIN_NAME;
    delete process.env.PRIMARY_ADMIN_EMAIL;
    delete process.env.EM_LEAD_NAME;
    delete process.env.JIRA_USER_EMAIL;
    delete process.env.GOOGLE_CALENDAR_ID;
    delete process.env.GITHUB_OWNER;

    databaseService.inMemoryTeamMembers = [];
    settingsService.cachedRawSettings = null;
    settingsService.initialized = false;
    await identityService.autoDiscoverAndSync({ seedFixtures: true });
  });

  afterEach(async () => {
    databaseService.inMemoryTeamMembers = [];
    settingsService.cachedRawSettings = null;
    settingsService.initialized = false;
    process.env = savedEnv;
  });

  it('should auto-discover and seed initial team members when external APIs return baseline', async () => {
    const syncRes = await identityService.autoDiscoverAndSync({ seedFixtures: true });

    expect(syncRes).toBeDefined();
    expect(syncRes.syncedCount).toBeGreaterThanOrEqual(3);
    expect(syncRes.members.length).toBeGreaterThanOrEqual(3);

    const alex = syncRes.members.find((m) => m.displayName.includes('Alex'));
    expect(alex).toBeDefined();
    expect(alex.githubUsername).toBe('alex-dev99');
    expect(alex.currentLevel).toBe('L4_MID');
  });

  it('should resolve a member by exact nickname alias', async () => {
    const resolved = await identityService.resolveMember('alexw');
    expect(resolved).toBeDefined();
    expect(resolved.displayName).toBe('Alex Williams');
    expect(resolved.githubUsername).toBe('alex-dev99');
  });

  it('should resolve a member by first name substring', async () => {
    const resolved = await identityService.resolveMember('Sarah');
    expect(resolved).toBeDefined();
    expect(resolved.displayName).toBe('Sarah Chen');
    expect(resolved.track).toBe('ENGINEERING_MANAGEMENT');
  });

  it('should resolve a member by GitHub handle with @ prefix', async () => {
    const resolved = await identityService.resolveMember('@taylor-dev');
    expect(resolved).toBeDefined();
    expect(resolved.displayName).toBe('Taylor Morgan');
    expect(resolved.githubUsername).toBe('taylor-dev');
  });

  it('should return null when querying an unknown member', async () => {
    const resolved = await identityService.resolveMember('non_existent_engineer_999');
    expect(resolved).toBeNull();
  });

  it('should resolve tool specific username from database for GitHub, Jira, Notion, and GCal', async () => {
    const ghUser = await identityService.getToolUsernameForMember('Alex', 'github');
    expect(ghUser).toBe('alex-dev99');

    const jiraUser = await identityService.getToolUsernameForMember('Sarah', 'jira');
    expect(jiraUser).toBe('sarah.chen@company.internal');

    const gcalUser = await identityService.getToolUsernameForMember('Taylor', 'gcal');
    expect(gcalUser).toBe('taylor.morgan@company.internal');
  });

  it('should extract and resolve member from natural language text query', async () => {
    const member = await identityService.resolveMemberFromText("Please review Alex's recent open pull requests");
    expect(member).toBeDefined();
    expect(member.displayName).toBe('Alex Williams');
    expect(member.githubUsername).toBe('alex-dev99');
  });

  it('should retrieve default Engineering Manager / Lead from database', async () => {
    const manager = await identityService.getDefaultManagerOrAdmin();
    expect(manager).toBeDefined();
    expect(['Sarah Chen', 'Vikas Kumar', 'Vikas Mca Jnu']).toContain(manager.displayName);
  });
});

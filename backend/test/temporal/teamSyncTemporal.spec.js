import {
  fetchGitHubTeamActivity,
  fetchJiraTeamActivity,
  fetchNotionTeamActivity,
  fetchGCalTeamActivity,
  reconcileAndPersistTeamActivity,
} from '../../src/temporal/activities.js';

describe('Node.js Temporal Team Sync Activities & Workflows', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('should run fetchGitHubTeamActivity with fallback when token is missing', async () => {
    const res = await fetchGitHubTeamActivity({});
    expect(res.source).toBe('github');
    expect(Array.isArray(res.members)).toBe(true);
  });

  it('should run fetchJiraTeamActivity with fallback when credentials missing', async () => {
    const res = await fetchJiraTeamActivity({});
    expect(res.source).toBe('jira');
    expect(Array.isArray(res.members)).toBe(true);
  });

  it('should run fetchNotionTeamActivity with fallback when apiKey is missing', async () => {
    const res = await fetchNotionTeamActivity({});
    expect(res.source).toBe('notion');
    expect(Array.isArray(res.members)).toBe(true);
  });

  it('should run fetchGCalTeamActivity with fallback when apiKey is missing', async () => {
    const res = await fetchGCalTeamActivity({});
    expect(res.source).toBe('gcal');
    expect(Array.isArray(res.members)).toBe(true);
  });

  it('should reconcile parallel harvests across tools with email correlation in reconcileAndPersistTeamActivity', async () => {
    const harvestResults = [
      {
        source: 'github',
        members: [
          {
            displayName: 'Alex Williams',
            email: 'alex.williams@company.internal',
            githubUsername: 'alex-dev99',
            aliases: ['Alex', 'alex-dev99'],
          },
        ],
      },
      {
        source: 'jira',
        members: [
          {
            displayName: 'Alex Williams',
            email: 'alex.williams@company.internal',
            jiraEmail: 'alex.williams@company.internal',
            jiraAccountId: '712020:abc123',
            aliases: ['Alex', 'alexw'],
          },
        ],
      },
      {
        source: 'notion',
        members: [
          {
            displayName: 'Alex Williams',
            email: 'alex.williams@company.internal',
            notionName: 'Alex Williams',
          },
        ],
      },
    ];

    const res = await reconcileAndPersistTeamActivity({ harvestResults });
    expect(res.status).toBe('SUCCESS');
    expect(res.persistedCount).toBeGreaterThanOrEqual(1);

    const alex = res.members.find(m => m.email === 'alex.williams@company.internal');
    expect(alex).toBeDefined();
    expect(alex.githubUsername).toBe('alex-dev99');
    expect(alex.jiraEmail).toBe('alex.williams@company.internal');
    expect(alex.aliases).toContain('alex-dev99');
  });
});

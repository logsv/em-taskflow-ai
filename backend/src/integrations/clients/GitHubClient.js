/**
 * GitHubClient (GoF Adapter / Facade Pattern)
 * Encapsulates all GitHub REST API communication, authentication header normalization,
 * and structured logging.
 */

import { BaseIntegrationClient } from './BaseIntegrationClient.js';
import settingsService from '../../services/settingsService.js';

export class GitHubClient extends BaseIntegrationClient {
  constructor() {
    super('github', 5000);
  }

  /**
   * Resolves authentication headers and repository configuration.
   * @param {Record<string, any>} overrides
   */
  getCredentials(overrides = {}) {
    const raw = settingsService.getCachedSettings() || settingsService.cachedRawSettings || {};
    const gh = raw?.mcp?.github || {};

    const token = (overrides.token !== undefined ? overrides.token : (gh.token || process.env.GITHUB_TOKEN || '')).trim();
    const owner = (overrides.owner !== undefined ? overrides.owner : (gh.owner || process.env.GITHUB_OWNER || '')).trim();
    const repo = (overrides.repo !== undefined ? overrides.repo : (gh.repo || process.env.GITHUB_REPO || '')).trim();

    let authHeader = '';
    if (token) {
      const cleanToken = token.replace(/^Bearer\s+Bearer\s+/i, 'Bearer ').replace(/^token\s+token\s+/i, 'token ');
      authHeader = cleanToken.startsWith('Bearer ') || cleanToken.startsWith('token ') ? cleanToken : `token ${cleanToken}`;
    }

    return { token, owner, repo, authHeader };
  }

  /**
   * Tests connection to GitHub API.
   * @param {Record<string, any>} credentials
   */
  async testConnection(credentials = {}) {
    const { token, owner, repo, authHeader } = this.getCredentials(credentials);

    if (!token) {
      return this.formatTestResult(false, 'No GitHub Personal Access Token configured');
    }

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/vnd.github.v3+json',
    });

    try {
      return await this.execute('testConnection', async () => {
        // 1. Verify user profile
        const userRes = await http.get('https://api.github.com/user');
        const login = userRes.data?.login;

        // 2. If repo configured, verify repository access
        let repoAccess = null;
        if (owner && repo) {
          try {
            const repoRes = await http.get(`https://api.github.com/repos/${owner}/${repo}`);
            repoAccess = {
              fullName: repoRes.data?.full_name,
              private: repoRes.data?.private,
              defaultBranch: repoRes.data?.default_branch,
            };
          } catch (_rErr) {
            repoAccess = { accessible: false };
          }
        }

        return this.formatTestResult(true, `Successfully connected to GitHub as @${login}`, {
          user: login,
          scopes: userRes.headers['x-oauth-scopes'] || 'token',
          rateLimitRemaining: userRes.headers['x-ratelimit-remaining'],
          repoAccess,
        });
      }, { user: token.slice(0, 7) });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return this.formatTestResult(false, `GitHub connection failed: ${msg}`, { error: msg });
    }
  }

  /**
   * Searches GitHub issues and pull requests.
   * @param {string} query
   * @param {Record<string, any>} options
   */
  async searchIssues(query, options = {}) {
    const { authHeader, owner, repo } = this.getCredentials(options);
    if (!authHeader) return { total_count: 0, items: [] };

    let q = query || 'is:open';
    if (owner && repo && !q.includes('repo:')) {
      q = `repo:${owner}/${repo} ${q}`;
    }

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/vnd.github.v3+json',
    });

    return this.execute('searchIssues', async () => {
      const res = await http.get('https://api.github.com/search/issues', {
        params: { q, per_page: options.perPage || 15 },
      });
      return res.data;
    }, { query: q });
  }

  /**
   * Fetches open pull requests for a repository.
   * @param {Record<string, any>} options
   */
  async getPullRequests(options = {}) {
    const { authHeader, owner, repo } = this.getCredentials(options);
    const targetOwner = options.owner || owner;
    const targetRepo = options.repo || repo;

    if (!authHeader || !targetOwner || !targetRepo) return [];

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/vnd.github.v3+json',
    });

    return this.execute('getPullRequests', async () => {
      const res = await http.get(`https://api.github.com/repos/${targetOwner}/${targetRepo}/pulls`, {
        params: {
          state: options.state || 'open',
          per_page: options.perPage || 20,
          sort: 'created',
          direction: 'desc',
        },
      });
      return Array.isArray(res.data) ? res.data : [];
    }, { owner: targetOwner, repo: targetRepo });
  }

  /**
   * Fetches issue or pull request details by number.
   * @param {number} issueNumber
   * @param {Record<string, any>} options
   */
  async getIssue(issueNumber, options = {}) {
    const { authHeader, owner, repo } = this.getCredentials(options);
    const targetOwner = options.owner || owner;
    const targetRepo = options.repo || repo;

    if (!authHeader || !targetOwner || !targetRepo || !issueNumber) return null;

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/vnd.github.v3+json',
    });

    return this.execute('getIssue', async () => {
      const res = await http.get(`https://api.github.com/repos/${targetOwner}/${targetRepo}/issues/${issueNumber}`);
      return res.data;
    }, { issueNumber, owner: targetOwner, repo: targetRepo });
  }

  /**
   * Fetches merged pull requests and workflow deployments for DORA calculations.
   * @param {Record<string, any>} options
   */
  async getDoraEvents(options = {}) {
    const { authHeader, owner, repo } = this.getCredentials(options);
    const targetOwner = options.owner || owner;
    const targetRepo = options.repo || repo;

    if (!authHeader || !targetOwner || !targetRepo) return { releases: [], pull_requests: [] };

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/vnd.github.v3+json',
    });

    return this.execute('getDoraEvents', async () => {
      const [prsRes, releasesRes] = await Promise.all([
        http.get(`https://api.github.com/repos/${targetOwner}/${targetRepo}/pulls`, {
          params: { state: 'closed', per_page: 30 },
        }).catch(() => ({ data: [] })),
        http.get(`https://api.github.com/repos/${targetOwner}/${targetRepo}/releases`, {
          params: { per_page: 15 },
        }).catch(() => ({ data: [] })),
      ]);

      const mergedPrs = (prsRes.data || []).filter((p) => p.merged_at);
      return {
        releases: releasesRes.data || [],
        pull_requests: mergedPrs,
        total_merged_prs: mergedPrs.length,
      };
    }, { owner: targetOwner, repo: targetRepo });
  }

  /**
   * Fetches repository contributors for team roster discovery.
   * @param {Record<string, any>} options
   */
  async getContributors(options = {}) {
    const { authHeader, owner, repo } = this.getCredentials(options);
    const targetOwner = options.owner || owner;
    const targetRepo = options.repo || repo;

    if (!authHeader || !targetOwner || !targetRepo) return [];

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/vnd.github.v3+json',
    });

    return this.execute('getContributors', async () => {
      const res = await http.get(`https://api.github.com/repos/${targetOwner}/${targetRepo}/contributors`, {
        params: { per_page: 30 },
      });
      return Array.isArray(res.data) ? res.data : [];
    }, { owner: targetOwner, repo: targetRepo });
  }

  /**
   * Fetches recent commits for author discovery.
   * @param {Record<string, any>} options
   */
  async getCommits(options = {}) {
    const { authHeader, owner, repo } = this.getCredentials(options);
    const targetOwner = options.owner || owner;
    const targetRepo = options.repo || repo;

    if (!authHeader || !targetOwner || !targetRepo) return [];

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/vnd.github.v3+json',
    });

    return this.execute('getCommits', async () => {
      const res = await http.get(`https://api.github.com/repos/${targetOwner}/${targetRepo}/commits`, {
        params: { per_page: 30 },
      });
      return Array.isArray(res.data) ? res.data : [];
    }, { owner: targetOwner, repo: targetRepo });
  }
}

export const githubClient = new GitHubClient();
export default githubClient;

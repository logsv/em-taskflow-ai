import databaseService from '../db/postgres.js';
import config from '../config.js';
import settingsService from './settingsService.js';

class GithubSyncService {
  /**
   * Sync issues from GitHub API into PostgreSQL DB (with JSONB)
   */
  async syncGithubData(repoName) {
    const cachedGithub = settingsService.getCachedSettings()?.mcp?.github || {};
    const defaultRepo = cachedGithub.owner && cachedGithub.repo ? `${cachedGithub.owner}/${cachedGithub.repo}` : (cachedGithub.repo || process.env.GITHUB_REPO || '');
    const effectiveRepo = repoName || defaultRepo;
    if (!effectiveRepo) {
      console.log('ℹ️ [GITHUB SYNC]: No GitHub repository configured, skipping sync.');
      return { totalSynced: 0, issues: [] };
    }
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || config?.mcp?.github?.token || cachedGithub.token;
    
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'EM-TaskFlow-AI-App',
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const apiUrl = `https://api.github.com/repos/${effectiveRepo}/issues?state=all&per_page=100`;
    console.log(`📡 [GITHUB SYNC]: Fetching issues from ${apiUrl}...`);

    let rawIssues = [];
    try {
      const response = await fetch(apiUrl, { headers });
      if (!response.ok) {
        throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
      }
      rawIssues = await response.json();
    } catch (error) {
      console.warn(`⚠️ [GITHUB SYNC]: Direct API fetch failed (${error.message}). Checking search API fallback...`);
      try {
        const searchUrl = `https://api.github.com/search/issues?q=repo:${repoName}+is:issue&per_page=100`;
        const searchRes = await fetch(searchUrl, { headers });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          rawIssues = searchData.items || [];
        } else {
          throw error;
        }
      } catch (fallbackError) {
        console.warn(`⚠️ [GITHUB SYNC]: All live API attempts failed (${fallbackError.message}). Using PostgreSQL cache fallback...`);
        const meta = await databaseService.getGithubSyncMetadata().catch(() => ({ total: 0, last_synced_at: null }));
        return {
          success: true,
          count: meta.total || 0,
          dbSavedCount: meta.total || 0,
          repo: repoName,
          syncedAt: meta.last_synced_at || new Date().toISOString(),
          isCacheFallback: true,
          message: `Loaded ${meta.total || 0} issue(s) from PostgreSQL cache. (Live API rate-limited).`
        };
      }
    }

    // Filter pull requests (GitHub API includes PRs in issues list)
    const issues = rawIssues
      .filter((item) => !item.pull_request)
      .map((item) => ({
        number: item.number,
        repo: item.repository_url ? item.repository_url.replace('https://api.github.com/repos/', '') : repoName,
        title: item.title,
        state: item.state,
        assignee: item.assignee?.login || item.user?.login || 'unassigned',
        user: item.user?.login || '',
        html_url: item.html_url,
        labels: (item.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
        body: item.body || '',
        created_at: item.created_at,
        updated_at: item.updated_at,
        synced_at: new Date().toISOString(),
      }));

    console.log(`📦 [GITHUB SYNC]: Processing ${issues.length} issue(s) for PostgreSQL storage...`);

    // Upsert into PostgreSQL DB
    const dbSavedCount = await databaseService.upsertGithubIssues(issues);
    console.log(`🗄️ [GITHUB SYNC]: Upserted ${dbSavedCount} issue(s) into PostgreSQL database`);

    const syncedAt = new Date().toISOString();
    return {
      success: true,
      count: issues.length,
      dbSavedCount,
      repo: repoName,
      syncedAt,
    };
  }

  /**
   * Fetch cached issues from PostgreSQL database
   */
  async fetchCachedGithubIssues({ query, state = 'open' } = {}) {
    try {
      const issues = await databaseService.getGithubIssues({ state, search: query });
      const meta = await databaseService.getGithubSyncMetadata();
      const lastSyncedAt = meta.last_synced_at ? new Date(meta.last_synced_at).toISOString() : null;

      return {
        issues,
        count: issues.length,
        source: 'postgresql',
        lastSyncedAt: lastSyncedAt || new Date().toISOString(),
      };
    } catch (dbError) {
      console.warn(`⚠️ [GITHUB CACHE]: DB query failed (${dbError.message}).`);
      return {
        issues: [],
        count: 0,
        source: 'postgresql',
        lastSyncedAt: null,
        error: dbError.message,
      };
    }
  }

  /**
   * Get PostgreSQL sync health metadata
   */
  async getSyncStatus() {
    try {
      const meta = await databaseService.getGithubSyncMetadata();
      return {
        postgresql: {
          count: meta.total,
          lastSyncedAt: meta.last_synced_at,
        },
      };
    } catch (e) {
      return {
        postgresql: {
          count: 0,
          lastSyncedAt: null,
          error: e.message,
        },
      };
    }
  }
}

const githubSyncService = new GithubSyncService();
export default githubSyncService;

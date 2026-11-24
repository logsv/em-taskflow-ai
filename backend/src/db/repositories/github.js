/**
 * Cached GitHub issues and pull requests.
 * Methods are mixed into DatabaseService (src/db/postgres.js); `this` is the service.
 */
import { warn } from '../../utils/logger.js';
import { recordHandledError } from '../../core/safe.js';
import { safeJsonParse } from '../rowMappers.js';

export class GithubRepository {
  /**
   * Batch upsert GitHub issues in one statement (unnest arrays), inside a transaction.
   * Returns the number of rows written to PostgreSQL: 0 when the database write failed
   * (the in-memory cache still holds the issues for this process, and the failure is counted).
   */
  async upsertGithubIssues(issues) {
    if (!Array.isArray(issues) || issues.length === 0) return 0;

    if (!(this.inMemoryGithubIssues instanceof Map)) {
      const existing = Array.isArray(this.inMemoryGithubIssues) ? this.inMemoryGithubIssues : [];
      this.inMemoryGithubIssues = new Map(existing.map((i) => [i.id, i]));
    }
    const defaultRepo = process.env.GITHUB_REPO || 'github_repo';
    const rows = [];
    for (const issue of issues) {
      const num = issue.number;
      if (num === null || num === undefined) continue;
      const targetRepo = issue.repo || defaultRepo;
      const id = `gh_${targetRepo}_${num}`;
      const htmlUrl = issue.html_url || `https://github.com/${targetRepo}/issues/${num}`;
      rows.push({ id, number: Number(num), repo: targetRepo, title: issue.title || '', state: issue.state || 'open', assignee: issue.assignee || '', htmlUrl, labels: issue.labels || [], data: issue });
      this.inMemoryGithubIssues.set(id, {
        id,
        number: num,
        repo: targetRepo,
        title: issue.title || '',
        state: issue.state || 'open',
        assignee: issue.assignee || null,
        html_url: htmlUrl,
        labels: issue.labels || [],
        data: issue,
        synced_at: issue.synced_at || new Date().toISOString(),
      });
    }
    if (rows.length === 0) return 0;

    try {
      return await this.withTransaction(async (client) => {
        const res = await client.query(
          `INSERT INTO github_issues (
            id, issue_number, repo, title, state, assignee, html_url, labels_json, data_json, synced_at
          )
          SELECT id, issue_number, repo, title, state, assignee, html_url, labels_json, data_json, NOW()
          FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::jsonb[], $9::jsonb[])
            AS t(id, issue_number, repo, title, state, assignee, html_url, labels_json, data_json)
          ON CONFLICT (id) DO UPDATE SET
            issue_number = EXCLUDED.issue_number,
            repo = EXCLUDED.repo,
            title = EXCLUDED.title,
            state = EXCLUDED.state,
            assignee = EXCLUDED.assignee,
            html_url = EXCLUDED.html_url,
            labels_json = EXCLUDED.labels_json,
            data_json = EXCLUDED.data_json,
            synced_at = NOW()`,
          [
            rows.map((r) => r.id),
            rows.map((r) => r.number),
            rows.map((r) => r.repo),
            rows.map((r) => r.title),
            rows.map((r) => r.state),
            rows.map((r) => r.assignee),
            rows.map((r) => r.htmlUrl),
            rows.map((r) => JSON.stringify(r.labels)),
            rows.map((r) => JSON.stringify(r.data)),
          ],
        );
        return res.rowCount ?? rows.length;
      });
    } catch (dbErr) {
      recordHandledError('db.postgres.upsertGithubIssues', dbErr);
      warn('PostgreSQL github_issues upsert failed; issues are cached in memory for this process only', { count: rows.length, err: dbErr.message });
      return 0;
    }
  }

  async getGithubIssues({ repo, state, search } = {}) {
    try {
      await this.ensureInitialized();
      let queryStr = `SELECT id, issue_number as number, repo, title, state, assignee, html_url, labels_json, data_json, synced_at FROM github_issues WHERE 1=1`;
      const params = [];

      let effectiveState = state;
      let effectiveSearch = search;

      if (search && typeof search === 'string') {
        const lowerSearch = search.toLowerCase();
        if (!effectiveState) {
          if (lowerSearch.includes('open')) effectiveState = 'open';
          else if (lowerSearch.includes('closed')) effectiveState = 'closed';
        }
        const stopWords = ['open', 'closed', 'github', 'issue', 'issues', 'pr', 'prs', 'pull-request', 'pull-requests', 'all', 'list', 'get', 'show', 'what', 'are', 'the', 'my', 'repo', 'repositories', 'tickets', 'ticket'];
        const cleanWords = lowerSearch
          .split(/\s+/)
          .filter((w) => w.length > 0 && !stopWords.includes(w));
        effectiveSearch = cleanWords.join(' ').trim();
      }

      if (repo && typeof repo === 'string' && repo.trim() !== '' && repo !== 'default' && repo !== 'all') {
        params.push(repo);
        queryStr += ` AND repo = $${params.length}`;
      }
      if (effectiveState) {
        params.push(effectiveState);
        queryStr += ` AND state = $${params.length}`;
      }
      if (effectiveSearch) {
        params.push(`%${effectiveSearch}%`);
        queryStr += ` AND (title ILIKE $${params.length} OR repo ILIKE $${params.length})`;
      }

      queryStr += ` ORDER BY issue_number DESC LIMIT 100`;

      const result = await this.pool.query(queryStr, params);
      if (result.rows.length === 0 && this.inMemoryGithubIssues) {
        const list = Array.isArray(this.inMemoryGithubIssues) ? this.inMemoryGithubIssues : Array.from(this.inMemoryGithubIssues.values());
        if (list.length > 0) return [...list];
      }
      return result.rows.map((row) => ({
        id: row.id,
        number: row.number,
        repo: row.repo,
        title: row.title,
        state: row.state,
        assignee: row.assignee,
        html_url: row.html_url,
        labels: safeJsonParse(row.labels_json),
        data: safeJsonParse(row.data_json),
        synced_at: row.synced_at,
      }));
    } catch (err) {
      warn("PostgreSQL getGithubIssues failed, using in-memory store fallback", { err: err.message });
      if (!this.inMemoryGithubIssues) return [];
      let issues = Array.isArray(this.inMemoryGithubIssues) ? this.inMemoryGithubIssues : Array.from(this.inMemoryGithubIssues.values());
      if (state) {
        issues = issues.filter((i) => i.state === state);
      }
      if (search) {
        const sLower = search.toLowerCase();
        const stopWords = ['open', 'closed', 'github', 'issue', 'issues', 'pr', 'prs', 'pull-request', 'all', 'list', 'get', 'show'];
        const cleanWords = sLower.split(/\s+/).filter((w) => w.length > 0 && !stopWords.includes(w));
        if (cleanWords.length > 0) {
          const cleanSearch = cleanWords.join(' ');
          issues = issues.filter((i) => i.title.toLowerCase().includes(cleanSearch) || i.repo?.toLowerCase().includes(cleanSearch));
        }
      }
      return issues;
    }
  }

  async getGithubSyncMetadata() {
    try {
      await this.ensureInitialized();
      const result = await this.pool.query(`
        SELECT COUNT(*)::int AS total, MAX(synced_at) AS last_synced_at FROM github_issues
      `);
      return result.rows[0] || { total: 0, last_synced_at: null };
    } catch (err) {
      warn("PostgreSQL getGithubSyncMetadata failed, using in-memory fallback", { err: err.message });
      if (!this.inMemoryGithubIssues) return { total: 0, last_synced_at: null };
      const issues = Array.isArray(this.inMemoryGithubIssues) ? this.inMemoryGithubIssues : Array.from(this.inMemoryGithubIssues.values());
      const maxSync = issues.reduce((max, i) => (i.synced_at > max ? i.synced_at : max), null);
      return { total: issues.length, last_synced_at: maxSync };
    }
  }
}

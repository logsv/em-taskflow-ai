/**
 * JiraClient (GoF Adapter / Facade Pattern)
 * Encapsulates Jira REST API (Cloud v3 and Server v2) communication,
 * authentication header normalization, and structured logging.
 */

import { BaseIntegrationClient } from './BaseIntegrationClient.js';
import settingsService from '../../services/settingsService.js';

export class JiraClient extends BaseIntegrationClient {
  constructor() {
    super('jira', 5000);
  }

  /**
   * Resolves authentication headers and base URL.
   * @param {Record<string, any>} overrides
   */
  getCredentials(overrides = {}) {
    const raw = settingsService.getCachedSettings() || settingsService.cachedRawSettings || {};
    const jira = raw?.mcp?.jira || {};

    const url = (overrides.url !== undefined ? overrides.url : (jira.url || process.env.JIRA_BASE_URL || '')).trim();
    const token = (overrides.apiToken !== undefined ? overrides.apiToken : (overrides.token !== undefined ? overrides.token : (jira.apiToken || process.env.JIRA_API_TOKEN || ''))).trim();
    const email = (overrides.email !== undefined ? overrides.email : (overrides.username !== undefined ? overrides.username : (jira.email || jira.username || process.env.JIRA_USER_EMAIL || process.env.JIRA_USERNAME || ''))).trim();
    const projectKey = (overrides.projectKey !== undefined ? overrides.projectKey : (jira.projectKey || process.env.JIRA_PROJECT_KEY || '')).trim();

    const cleanBaseUrl = url.replace(/\/rest\/api\/[23]\/?$/, '').replace(/\/$/, '');

    let authHeader = '';
    if (token) {
      if (email && !token.startsWith('Basic ') && !token.startsWith('Bearer ')) {
        authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
      } else if (token.startsWith('Basic ') || token.startsWith('Bearer ')) {
        authHeader = token;
      } else {
        authHeader = `Bearer ${token}`;
      }
    }

    return { url: cleanBaseUrl, rawUrl: url, token, email, projectKey, authHeader };
  }

  /**
   * Tests connection to Jira API.
   * @param {Record<string, any>} credentials
   */
  async testConnection(credentials = {}) {
    const { url, rawUrl, token, email, authHeader } = this.getCredentials(credentials);

    if (credentials.url && !credentials.url.startsWith('http://') && !credentials.url.startsWith('https://')) {
      return this.formatTestResult(false, 'Invalid Jira URL: must start with https:// or http://');
    }

    if (credentials.url === '' || credentials.email === '') {
      return this.formatTestResult(false, 'Jira Base URL or User Email cannot be empty');
    }

    if (!url) {
      return this.formatTestResult(false, 'No Jira Base URL configured');
    }

    if (!token) {
      return this.formatTestResult(false, 'No Jira API Token or Password provided');
    }

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/json',
    });

    try {
      return await this.execute('testConnection', async () => {
        // 1. Verify user profile
        let userRes;
        try {
          userRes = await http.get(`${url}/rest/api/3/myself`);
        } catch (uErr) {
          if (uErr.response?.status && [404, 410].includes(uErr.response.status)) {
            userRes = await http.get(`${url}/rest/api/2/myself`);
          } else {
            throw uErr;
          }
        }

        const displayName = userRes.data?.displayName || userRes.data?.name || email;

        // 2. Fetch server info
        let serverTitle = 'Jira Cloud';
        try {
          const infoRes = await http.get(`${url}/rest/api/3/serverInfo`);
          serverTitle = infoRes.data?.serverTitle || infoRes.data?.version || serverTitle;
        } catch (_iErr) {}

        return this.formatTestResult(true, `Successfully connected to Jira as ${displayName} (${serverTitle})`, {
          user: displayName,
          email: userRes.data?.emailAddress || email,
          accountId: userRes.data?.accountId,
          serverTitle,
        });
      }, { url, email });
    } catch (err) {
      const msg = err.response?.data?.errorMessages?.[0] || err.response?.data?.message || err.message;
      return this.formatTestResult(false, `Jira connection failed: ${msg}`, { error: msg });
    }
  }

  /**
   * Executes a JQL search against Jira.
   * @param {string} jql
   * @param {Record<string, any>} options
   */
  async searchJql(jql, options = {}) {
    const { url, authHeader, projectKey } = this.getCredentials(options);
    if (!url || !authHeader) return { issues: [], total: 0 };

    let effectiveJql = jql || 'order by created DESC';
    if (projectKey && !effectiveJql.includes('project')) {
      effectiveJql = `project = "${projectKey}" AND (${effectiveJql})`;
    }

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });

    return this.execute('searchJql', async () => {
      let res;
      try {
        res = await http.get(`${url}/rest/api/3/search`, {
          params: {
            jql: effectiveJql,
            maxResults: options.maxResults || 20,
            fields: 'summary,status,assignee,priority,issuetype,created,updated,description',
          },
        });
      } catch (err) {
        if (err.response?.status && [404, 410].includes(err.response.status)) {
          res = await http.get(`${url}/rest/api/2/search`, {
            params: {
              jql: effectiveJql,
              maxResults: options.maxResults || 20,
              fields: 'summary,status,assignee,priority,issuetype,created,updated,description',
            },
          });
        } else {
          throw err;
        }
      }
      return res.data;
    }, { jql: effectiveJql });
  }

  /**
   * Fetches an issue by key.
   * @param {string} issueKey
   * @param {Record<string, any>} options
   */
  async getIssue(issueKey, options = {}) {
    const { url, authHeader } = this.getCredentials(options);
    if (!url || !authHeader || !issueKey) return null;

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/json',
    });

    return this.execute('getIssue', async () => {
      let res;
      try {
        res = await http.get(`${url}/rest/api/3/issue/${issueKey}`);
      } catch (err) {
        if (err.response?.status && [404, 410].includes(err.response.status)) {
          res = await http.get(`${url}/rest/api/2/issue/${issueKey}`);
        } else {
          throw err;
        }
      }
      return res.data;
    }, { issueKey });
  }

  /**
   * Searches users for team discovery.
   * @param {string} query
   * @param {Record<string, any>} options
   */
  async searchUsers(query = '', options = {}) {
    const { url, authHeader } = this.getCredentials(options);
    if (!url || !authHeader) return [];

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      Accept: 'application/json',
    });

    return this.execute('searchUsers', async () => {
      let res;
      try {
        res = await http.get(`${url}/rest/api/3/user/search`, {
          params: { query, maxResults: options.maxResults || 50 },
        });
      } catch (uErr) {
        if (uErr.response?.status && [404, 410].includes(uErr.response.status)) {
          res = await http.get(`${url}/rest/api/3/users/search`, {
            params: { maxResults: options.maxResults || 50 },
          });
        } else {
          throw uErr;
        }
      }
      return Array.isArray(res.data) ? res.data : [];
    }, { query });
  }
}

export const jiraClient = new JiraClient();
export default jiraClient;

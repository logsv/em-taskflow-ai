/**
 * NotionClient (GoF Adapter / Facade Pattern)
 * Encapsulates Notion REST API communication, authentication header normalization,
 * and structured logging.
 */

import { BaseIntegrationClient } from './BaseIntegrationClient.js';
import settingsService from '../../services/settingsService.js';

export class NotionClient extends BaseIntegrationClient {
  constructor() {
    super('notion', 5000);
  }

  /**
   * Resolves authentication headers and settings.
   * @param {Record<string, any>} overrides
   */
  getCredentials(overrides = {}) {
    const raw = settingsService.getCachedSettings() || settingsService.cachedRawSettings || {};
    const notion = raw?.mcp?.notion || {};

    const apiKey = (overrides.apiKey !== undefined ? overrides.apiKey : (overrides.token !== undefined ? overrides.token : (notion.apiKey || process.env.NOTION_API_KEY || ''))).trim();
    const cleanToken = apiKey.replace(/^Bearer\s+/i, '');
    const authHeader = cleanToken ? `Bearer ${cleanToken}` : '';

    return { apiKey: cleanToken, authHeader };
  }

  /**
   * Tests connection to Notion API.
   * @param {Record<string, any>} credentials
   */
  async testConnection(credentials = {}) {
    const { apiKey, authHeader } = this.getCredentials(credentials);

    if (credentials.apiKey === '') {
      return this.formatTestResult(false, 'No Notion API Key configured');
    }

    if (!apiKey) {
      return this.formatTestResult(true, 'Notion connector initialized. Add Notion Integration Token to query roadmaps & OKRs.');
    }

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    });

    try {
      return await this.execute('testConnection', async () => {
        // 1. Fetch current bot user
        const botRes = await http.get('https://api.notion.com/v1/users/me');
        const botName = botRes.data?.name || 'TaskFlow Integration Bot';

        // 2. Perform search to verify workspace scope
        const searchRes = await http.post('https://api.notion.com/v1/search', {
          page_size: 5,
        });

        const resultsCount = searchRes.data?.results?.length || 0;
        return this.formatTestResult(true, `Successfully connected to Notion workspace as '${botName}' (${resultsCount} accessible items)`, {
          botName,
          botId: botRes.data?.id,
          accessibleItems: resultsCount,
        });
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return this.formatTestResult(false, `Notion connection failed: ${msg}`, { error: msg });
    }
  }

  /**
   * Searches workspace pages and databases.
   * @param {string} query
   * @param {Record<string, any>} options
   */
  async search(query, options = {}) {
    const { authHeader } = this.getCredentials(options);
    if (!authHeader) return { results: [] };

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    });

    return this.execute('search', async () => {
      const body = {
        query: query || '',
        page_size: options.pageSize || 10,
      };
      if (options.filter) {
        body.filter = options.filter;
      }
      const res = await http.post('https://api.notion.com/v1/search', body);
      return res.data;
    }, { query });
  }

  /**
   * Fetches page metadata and content blocks.
   * @param {string} pageId
   * @param {Record<string, any>} options
   */
  async getPageContent(pageId, options = {}) {
    const { authHeader } = this.getCredentials(options);
    if (!authHeader || !pageId) return null;

    const cleanPageId = pageId.replace(/-/g, '');
    const http = this.createAxiosInstance({
      Authorization: authHeader,
      'Notion-Version': '2022-06-28',
    });

    return this.execute('getPageContent', async () => {
      const [pageRes, blocksRes] = await Promise.all([
        http.get(`https://api.notion.com/v1/pages/${cleanPageId}`),
        http.get(`https://api.notion.com/v1/blocks/${cleanPageId}/children?page_size=50`).catch(() => ({ data: { results: [] } })),
      ]);

      const titleProp = Object.values(pageRes.data?.properties || {}).find((p) => p.type === 'title');
      const title = titleProp?.title?.[0]?.plain_text || 'Untitled Notion Page';

      return {
        id: pageRes.data.id,
        url: pageRes.data.url,
        title,
        created_time: pageRes.data.created_time,
        last_edited_time: pageRes.data.last_edited_time,
        blocks_count: blocksRes.data?.results?.length || 0,
        blocks: blocksRes.data?.results || [],
      };
    }, { pageId: cleanPageId });
  }

  /**
   * Queries a Notion database.
   * @param {string} databaseId
   * @param {Record<string, any>} options
   */
  async queryDatabase(databaseId, options = {}) {
    const { authHeader } = this.getCredentials(options);
    if (!authHeader || !databaseId) return { results: [] };

    const cleanDbId = databaseId.replace(/-/g, '');
    const http = this.createAxiosInstance({
      Authorization: authHeader,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    });

    return this.execute('queryDatabase', async () => {
      const body = {};
      if (options.filter) body.filter = options.filter;
      if (options.sorts) body.sorts = options.sorts;
      body.page_size = options.pageSize || 20;

      const res = await http.post(`https://api.notion.com/v1/databases/${cleanDbId}/query`, body);
      return res.data;
    }, { databaseId: cleanDbId });
  }

  /**
   * Lists workspace users for team discovery.
   * @param {Record<string, any>} options
   */
  async listUsers(options = {}) {
    const { authHeader } = this.getCredentials(options);
    if (!authHeader) return [];

    const http = this.createAxiosInstance({
      Authorization: authHeader,
      'Notion-Version': '2022-06-28',
    });

    return this.execute('listUsers', async () => {
      const res = await http.get('https://api.notion.com/v1/users?page_size=50');
      return res.data?.results || [];
    });
  }
}

export const notionClient = new NotionClient();
export default notionClient;

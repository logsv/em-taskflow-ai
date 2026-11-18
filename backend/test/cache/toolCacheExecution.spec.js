import { toolCache, isCacheableTool, isCacheableResult } from '../../src/cache/toolCache.js';
import { cacheInvalidator } from '../../src/cache/cacheInvalidator.js';
import { executeMCPTool, closeMCP, __setMCPToolsForTesting } from '../../src/mcp/index.js';

function fakeTool(name, impl) {
  const tool = {
    name,
    calls: [],
    async invoke(params) {
      tool.calls.push(params);
      return impl(params, tool.calls.length);
    },
  };
  return tool;
}

const ok = (payload) => JSON.stringify({ ...payload, source: 'live_api' });

describe('Tier 2 MCP Tool Cache wired into executeMCPTool', () => {
  let jiraSearch;
  let jiraGetIssue;
  let jiraCreateIssue;
  let searchIssues;
  let notionSearch;
  let calendarEvents;
  let createCalendarEvent;
  let slackPost;
  let slackSearch;

  beforeEach(() => {
    toolCache.clear();
    jiraSearch = fakeTool('jira_search', (p, n) => ok({ jql: p.jql, call: n, issues: [] }));
    jiraGetIssue = fakeTool('jira_get_issue', (p, n) => ok({ key: p.issue_key, call: n }));
    jiraCreateIssue = fakeTool('jira_create_issue', (p, n) => ok({ key: `ENG-${n}` }));
    searchIssues = fakeTool('search_issues', (p, n) => ok({ query: p.query, call: n }));
    notionSearch = fakeTool('notion_search', (p, n) => ok({ query: p.query, call: n }));
    calendarEvents = fakeTool('get_calendar_events', (p, n) => ok({ call: n, events: [] }));
    createCalendarEvent = fakeTool('create_calendar_event', (p, n) => ok({ id: `evt-${n}` }));
    slackPost = fakeTool('slack_post_message', (p, n) => ok({ ts: `ts-${n}` }));
    slackSearch = fakeTool('slack_search_messages', (p, n) => ok({ query: p.query, call: n }));

    __setMCPToolsForTesting({
      jira: [jiraSearch, jiraGetIssue, jiraCreateIssue],
      github: [searchIssues],
      notion: [notionSearch],
      google: [calendarEvents, createCalendarEvent],
      slack: [slackPost, slackSearch],
    });
  });

  afterEach(async () => {
    toolCache.clear();
    await closeMCP();
  });

  describe('allowlist', () => {
    it('allows read-only tools and rejects write tools', () => {
      ['jira_search', 'jira_get_issue', 'search_issues', 'list_pull_requests', 'notion_search',
        'notion_get_page', 'notion_query_database', 'get_calendar_events', 'slack_search_messages',
        'slack_list_channels'].forEach((name) => expect(isCacheableTool(name)).withContext(name).toBe(true));
      ['slack_post_message', 'jira_create_issue', 'create_calendar_event', 'unknown_tool']
        .forEach((name) => expect(isCacheableTool(name)).withContext(name).toBe(false));
    });

    it('rejects UNAVAILABLE / error payloads', () => {
      expect(isCacheableResult(JSON.stringify({ status: 'UNAVAILABLE', service: 'jira' }))).toBe(false);
      expect(isCacheableResult({ status: 'UNAVAILABLE' })).toBe(false);
      expect(isCacheableResult('Error executing tool jira_search: boom')).toBe(false);
      expect(isCacheableResult(null)).toBe(false);
      expect(isCacheableResult(ok({ issues: [] }))).toBe(true);
      expect(isCacheableResult(JSON.stringify({ status: 'In Progress', key: 'ENG-1' }))).toBe(true);
    });
  });

  describe('read tools', () => {
    it('serves the second identical call from cache', async () => {
      const first = await executeMCPTool('jira_search', { jql: 'project = ENG' });
      const second = await executeMCPTool('jira_search', { jql: 'project = ENG' });

      expect(second).toBe(first);
      expect(jiraSearch.calls.length).toBe(1);
      expect(toolCache.cache.size).toBe(1);
    });

    it('keys on arguments, so different args miss', async () => {
      await executeMCPTool('jira_get_issue', { issue_key: 'ENG-1' });
      await executeMCPTool('jira_get_issue', { issue_key: 'ENG-2' });
      expect(jiraGetIssue.calls.length).toBe(2);
    });

    it('caches every allowlisted read service', async () => {
      await executeMCPTool('search_issues', { query: 'is:open' });
      await executeMCPTool('search_issues', { query: 'is:open' });
      await executeMCPTool('notion_search', { query: 'goals' });
      await executeMCPTool('notion_search', { query: 'goals' });
      await executeMCPTool('get_calendar_events', {});
      await executeMCPTool('get_calendar_events', {});
      await executeMCPTool('slack_search_messages', { query: 'retro' });
      await executeMCPTool('slack_search_messages', { query: 'retro' });

      expect(searchIssues.calls.length).toBe(1);
      expect(notionSearch.calls.length).toBe(1);
      expect(calendarEvents.calls.length).toBe(1);
      expect(slackSearch.calls.length).toBe(1);
    });

    it('caches under the resolved tool name when an alias is used', async () => {
      await executeMCPTool('list_events', {});
      await executeMCPTool('get_calendar_events', {});
      expect(calendarEvents.calls.length).toBe(1);
    });
  });

  describe('fetch_fresh_data semantics', () => {
    it('fetch_fresh_data: true bypasses the lookup and refreshes the entry', async () => {
      const first = await executeMCPTool('jira_search', { jql: 'x' });
      const fresh = await executeMCPTool('jira_search', { jql: 'x', fetch_fresh_data: true });
      const afterFresh = await executeMCPTool('jira_search', { jql: 'x' });

      expect(jiraSearch.calls.length).toBe(2);
      expect(fresh).not.toBe(first);
      expect(afterFresh).toBe(fresh);
    });

    it('fetch_fresh_data: false allows cache hits and shares the key with the plain call', async () => {
      await executeMCPTool('jira_search', { jql: 'x' });
      await executeMCPTool('jira_search', { jql: 'x', fetch_fresh_data: false });
      expect(jiraSearch.calls.length).toBe(1);
    });

    it('never forwards fetch_fresh_data to the tool', async () => {
      await executeMCPTool('jira_search', { jql: 'x', fetch_fresh_data: true });
      await executeMCPTool('slack_post_message', { channel: 'c', message: 'm', fetch_fresh_data: false });
      expect(jiraSearch.calls[0]).toEqual({ jql: 'x' });
      expect(slackPost.calls[0]).toEqual({ channel: 'c', message: 'm' });
    });
  });

  describe('write tools', () => {
    it('never caches slack_post_message, jira_create_issue or create_calendar_event', async () => {
      await executeMCPTool('slack_post_message', { channel: 'c', message: 'hi' });
      await executeMCPTool('slack_post_message', { channel: 'c', message: 'hi' });
      await executeMCPTool('jira_create_issue', { summary: 's' });
      await executeMCPTool('jira_create_issue', { summary: 's' });
      await executeMCPTool('create_calendar_event', { title: 't' });
      await executeMCPTool('create_calendar_event', { title: 't' });

      expect(slackPost.calls.length).toBe(2);
      expect(jiraCreateIssue.calls.length).toBe(2);
      expect(createCalendarEvent.calls.length).toBe(2);
      expect(toolCache.cache.size).toBe(0);
    });
  });

  describe('error payloads', () => {
    it('does not cache status: UNAVAILABLE results, so recovery is seen immediately', async () => {
      const flaky = fakeTool('jira_search', (p, n) => (n === 1
        ? JSON.stringify({ status: 'UNAVAILABLE', service: 'jira', reason: 'JIRA_NOT_CONFIGURED_OR_UNREACHABLE' })
        : ok({ call: n, issues: [] })));
      __setMCPToolsForTesting({ jira: [flaky] });

      const down = await executeMCPTool('jira_search', { jql: 'x' });
      const up = await executeMCPTool('jira_search', { jql: 'x' });
      const cached = await executeMCPTool('jira_search', { jql: 'x' });

      expect(JSON.parse(down).status).toBe('UNAVAILABLE');
      expect(JSON.parse(up).status).toBeUndefined();
      expect(cached).toBe(up);
      expect(flaky.calls.length).toBe(2);
    });

    it('does not cache resiliency-wrapper error strings', async () => {
      const failing = fakeTool('notion_search', () => 'Error executing tool notion_search: timeout');
      __setMCPToolsForTesting({ notion: [failing] });

      await executeMCPTool('notion_search', { query: 'q' });
      await executeMCPTool('notion_search', { query: 'q' });
      expect(failing.calls.length).toBe(2);
      expect(toolCache.cache.size).toBe(0);
    });
  });

  describe('invalidation', () => {
    it('invalidateAll (settings save / credential rotation) clears entries', async () => {
      await executeMCPTool('jira_search', { jql: 'x' });
      await executeMCPTool('notion_search', { query: 'q' });
      expect(toolCache.cache.size).toBe(2);

      await cacheInvalidator.invalidateAll();
      expect(toolCache.cache.size).toBe(0);

      await executeMCPTool('jira_search', { jql: 'x' });
      expect(jiraSearch.calls.length).toBe(2);
    });

    it('invalidateDomain clears entries for the matching service only', async () => {
      await executeMCPTool('jira_search', { jql: 'x' });
      await executeMCPTool('notion_search', { query: 'q' });

      const res = await cacheInvalidator.invalidateDomain('jira');
      expect(res.toolCount).toBe(1);
      expect(toolCache.cache.size).toBe(1);

      await executeMCPTool('notion_search', { query: 'q' });
      expect(notionSearch.calls.length).toBe(1);
    });

    it('invalidateDomain for an agent domain clears the services it reads from', async () => {
      await executeMCPTool('jira_search', { jql: 'x' });
      await executeMCPTool('search_issues', { query: 'is:open' });
      await executeMCPTool('slack_search_messages', { query: 'retro' });

      await cacheInvalidator.invalidateDomain('dora'); // github + jira
      expect(toolCache.cache.size).toBe(1);
    });

    it('invalidateDocument clears Notion-sourced entries', async () => {
      await executeMCPTool('notion_search', { query: 'q' });
      await executeMCPTool('jira_search', { jql: 'x' });

      const res = await cacheInvalidator.invalidateDocument('sop_handbook.pdf');
      expect(res.toolCount).toBe(1);
      expect(toolCache.cache.size).toBe(1);
      await executeMCPTool('notion_search', { query: 'q' });
      expect(notionSearch.calls.length).toBe(2);
    });
  });
});

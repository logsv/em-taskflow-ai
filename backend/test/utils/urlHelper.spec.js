import {
  getDirectOrFormattedGithubUrl,
  getDirectOrFormattedJiraUrl,
  getDirectOrFormattedNotionUrl,
  formatMarkdownLinkOrCode,
} from '../../src/utils/urlHelper.js';
import settingsService from '../../src/services/settingsService.js';

describe('urlHelper Utility Specs', () => {
  beforeEach(() => {
    settingsService.cachedRawSettings = null;
    settingsService.initialized = false;
  });
  describe('getDirectOrFormattedGithubUrl', () => {
    it('should return direct html_url when present', () => {
      const item = { html_url: 'https://github.com/myorg/myrepo/pull/123' };
      expect(getDirectOrFormattedGithubUrl(item)).toBe('https://github.com/myorg/myrepo/pull/123');
    });

    it('should return raw URL string when passed directly', () => {
      expect(getDirectOrFormattedGithubUrl('https://github.com/myorg/myrepo/pull/456')).toBe('https://github.com/myorg/myrepo/pull/456');
    });

    it('should format URL from repo and number if valid', () => {
      const item = { number: 42, repo: 'custom/repo', is_pull_request: true };
      expect(getDirectOrFormattedGithubUrl(item)).toBe('https://github.com/custom/repo/pull/42');
    });

    it('should return null for null or invalid inputs', () => {
      expect(getDirectOrFormattedGithubUrl(null)).toBeNull();
      expect(getDirectOrFormattedGithubUrl({})).toBeNull();
      expect(getDirectOrFormattedGithubUrl({ repo: 'dummy_repo', number: 1 })).toBeNull();
    });
  });

  describe('getDirectOrFormattedJiraUrl', () => {
    const originalJiraUrl = process.env.JIRA_BASE_URL;

    afterEach(() => {
      if (originalJiraUrl !== undefined) {
        process.env.JIRA_BASE_URL = originalJiraUrl;
      } else {
        delete process.env.JIRA_BASE_URL;
      }
    });

    it('should return direct url when present on issue object', () => {
      const item = { key: 'ENG-104', url: 'https://mycompany.atlassian.net/browse/ENG-104' };
      expect(getDirectOrFormattedJiraUrl(item)).toBe('https://mycompany.atlassian.net/browse/ENG-104');
    });

    it('should construct URL when JIRA_BASE_URL is configured', () => {
      process.env.JIRA_BASE_URL = 'https://jira.company.com';
      expect(getDirectOrFormattedJiraUrl('ENG-205')).toBe('https://jira.company.com/browse/ENG-205');
      expect(getDirectOrFormattedJiraUrl({ key: 'ENG-205' })).toBe('https://jira.company.com/browse/ENG-205');
    });

    it('should return null when JIRA_BASE_URL is missing or dummy', () => {
      delete process.env.JIRA_BASE_URL;
      expect(getDirectOrFormattedJiraUrl('ENG-104')).toBeNull();

      process.env.JIRA_BASE_URL = 'https://dummy.jira.com';
      expect(getDirectOrFormattedJiraUrl('ENG-104')).toBeNull();
    });
  });

  describe('getDirectOrFormattedNotionUrl', () => {
    it('should return direct url when present', () => {
      expect(getDirectOrFormattedNotionUrl({ url: 'https://notion.so/my-page' })).toBe('https://notion.so/my-page');
      expect(getDirectOrFormattedNotionUrl('https://notion.so/my-page')).toBe('https://notion.so/my-page');
    });

    it('should return null for null or invalid inputs', () => {
      expect(getDirectOrFormattedNotionUrl(null)).toBeNull();
      expect(getDirectOrFormattedNotionUrl({})).toBeNull();
    });
  });

  describe('formatMarkdownLinkOrCode', () => {
    it('should return markdown link when url is valid', () => {
      expect(formatMarkdownLinkOrCode('ENG-104', 'https://jira.company.com/browse/ENG-104')).toBe('[ENG-104](https://jira.company.com/browse/ENG-104)');
    });

    it('should return inline monospace code when url is null, empty, or #', () => {
      expect(formatMarkdownLinkOrCode('ENG-104', null)).toBe('`ENG-104`');
      expect(formatMarkdownLinkOrCode('ENG-104', '#')).toBe('`ENG-104`');
      expect(formatMarkdownLinkOrCode('ENG-104', '')).toBe('`ENG-104`');
      expect(formatMarkdownLinkOrCode('ENG-104', 'https://placeholder.url')).toBe('`ENG-104`');
    });
  });
});

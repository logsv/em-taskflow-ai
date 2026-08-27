import settingsService from '../services/settingsService.js';

/**
 * URL Helper Utility
 * Standardizes direct API URL consumption across GitHub, Jira, and Notion.
 * Ensures that if an integration is unconfigured or a provider does not return a valid URL,
 * safe fallback rendering (e.g. `ENG-104` or `#42`) is used instead of broken fake domains.
 */

/**
 * Returns a direct or formatted GitHub URL for an issue/PR.
 * Prefers item.html_url or item.url directly from the GitHub API / DB.
 * Only builds a URL if owner/repo and number are reliably known.
 * 
 * @param {Object|string} item GitHub issue or PR object, or URL string
 * @param {string} [fallbackRepo] Optional owner/repo fallback
 * @returns {string|null} Full URL string or null
 */
export function getDirectOrFormattedGithubUrl(item, fallbackRepo = null) {
  if (!item) return null;
  if (typeof item === 'string') {
    if (item.startsWith('http://') || item.startsWith('https://')) return item;
    return null;
  }

  // 1. Direct html_url or url returned by GitHub API
  if (item.html_url && (item.html_url.startsWith('https://') || item.html_url.startsWith('http://'))) {
    return item.html_url;
  }
  if (item.url && (item.url.startsWith('https://github.com') || item.url.startsWith('http://github.com'))) {
    return item.url;
  }

  // 2. Construct from repo & number if available
  const cachedSettings = settingsService.getCachedSettings()?.mcp?.github || {};
  const repoSlug = item.repo || fallbackRepo || (cachedSettings.owner && cachedSettings.repo ? `${cachedSettings.owner}/${cachedSettings.repo}` : cachedSettings.repo);
  const num = item.number || (typeof item.id === 'string' && item.id.startsWith('#') ? item.id.slice(1) : null);

  if (repoSlug && num && !repoSlug.includes('dummy') && !repoSlug.includes('github_repo')) {
    const isPr = item.is_pull_request || item.isPr || (item.html_url && item.html_url.includes('/pull/'));
    const pathType = isPr ? 'pull' : 'issues';
    return `https://github.com/${repoSlug}/${pathType}/${num}`;
  }

  return null;
}

/**
 * Returns a direct or formatted Jira URL for an issue key.
 * Prefers item.url or item.self / item.browseUrl.
 * Falls back to configured JIRA_BASE_URL. If unconfigured, returns null (never creates fake jira.atlassian.net).
 * 
 * @param {Object|string} itemOrKey Jira issue object or issue key string (e.g. 'ENG-104')
 * @returns {string|null} Full URL string or null
 */
export function getDirectOrFormattedJiraUrl(itemOrKey) {
  if (!itemOrKey) return null;

  if (typeof itemOrKey === 'object') {
    if (itemOrKey.url && (itemOrKey.url.startsWith('https://') || itemOrKey.url.startsWith('http://'))) {
      return itemOrKey.url;
    }
    if (itemOrKey.browseUrl && (itemOrKey.browseUrl.startsWith('https://') || itemOrKey.browseUrl.startsWith('http://'))) {
      return itemOrKey.browseUrl;
    }
  }

  const key = typeof itemOrKey === 'string' ? itemOrKey : itemOrKey.key;
  if (!key) return null;

  const cachedSettings = settingsService.getCachedSettings()?.mcp?.jira || {};
  const baseUrl = process.env.JIRA_BASE_URL || cachedSettings.url || null;
  
  const isPlaceholder = (u) => !u || 
    u.includes('dummy') || 
    u.includes('placeholder') || 
    u.includes('your-company') || 
    u.includes('company.atlassian.net') ||
    u.includes('example.com') ||
    u === 'https://jira.atlassian.net';

  if (!baseUrl || isPlaceholder(baseUrl)) {
    return null;
  }

  const cleanBase = baseUrl.replace(/\/rest\/api\/.*$/, '').replace(/\/$/, '');
  return `${cleanBase}/browse/${key}`;
}

/**
 * Returns a direct Notion URL.
 * 
 * @param {Object|string} itemOrPage Notion object or URL string
 * @returns {string|null}
 */
export function getDirectOrFormattedNotionUrl(itemOrPage) {
  if (!itemOrPage) return null;
  if (typeof itemOrPage === 'string') {
    return (itemOrPage.startsWith('https://') || itemOrPage.startsWith('http://')) ? itemOrPage : null;
  }
  return itemOrPage.url || itemOrPage.html_url || null;
}

/**
 * Formats markdown link if URL is valid, or returns safe monospace code format if URL is null/empty.
 * Eliminates dead links (#) and fake placeholder URLs.
 * 
 * @param {string} text Display text (e.g. 'ENG-104' or '#42: Title')
 * @param {string|null} url Target URL
 * @returns {string} Markdown link or inline code
 */
export function formatMarkdownLinkOrCode(text, url) {
  if (url && typeof url === 'string' && url.trim() !== '' && url !== '#' && !url.includes('placeholder')) {
    return `[${text}](${url})`;
  }
  return `\`${text}\``;
}

export default {
  getDirectOrFormattedGithubUrl,
  getDirectOrFormattedJiraUrl,
  getDirectOrFormattedNotionUrl,
  formatMarkdownLinkOrCode,
};

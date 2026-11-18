import crypto from 'crypto';
import { cacheInvalidator } from './cacheInvalidator.js';
import { debug, info, warn } from '../utils/logger.js';

/**
 * Explicit allowlist of read-only MCP tools whose results may be cached.
 * Write tools (slack_post_message, jira_create_issue, create_calendar_event, ...)
 * must never appear here.
 */
export const CACHEABLE_READ_TOOLS = Object.freeze({
  // Jira
  jira_search: 'jira',
  jira_get_issue: 'jira',
  jira_get_sprint_report: 'jira',
  // GitHub
  search_issues: 'github',
  issue_read: 'github',
  list_pull_requests: 'github',
  get_pull_requests: 'github',
  get_dora_events: 'github',
  // Notion
  notion_search: 'notion',
  notion_get_page: 'notion',
  notion_query_database: 'notion',
  // Google Calendar
  get_calendar_events: 'calendar',
  get_event_details: 'calendar',
  // Slack
  slack_search_messages: 'slack',
  slack_list_channels: 'slack',
});

/**
 * Agent/cache domains -> integration services whose tool results feed them.
 * Used so cacheInvalidator.invalidateDomain('<agent domain>') also drops the
 * tool results that domain is built from.
 */
const DOMAIN_SERVICE_MAP = Object.freeze({
  jira: ['jira'],
  github: ['github'],
  notion: ['notion'],
  calendar: ['calendar'],
  google: ['calendar'],
  slack: ['slack'],
  dora: ['github', 'jira'],
  delivery: ['jira', 'github'],
  sprint: ['jira', 'calendar'],
  people: ['calendar', 'notion', 'jira'],
  retro: ['notion', 'jira', 'github', 'slack'],
  roadmap: ['jira', 'github', 'notion'],
  okr: ['notion', 'jira'],
  sop: ['notion', 'github'],
  sbi: ['jira', 'slack'],
});

export function isCacheableTool(toolName) {
  return Object.prototype.hasOwnProperty.call(CACHEABLE_READ_TOOLS, toolName);
}

/**
 * Returns false for error / UNAVAILABLE payloads so a transient outage is
 * never served back from cache.
 */
export function isCacheableResult(result) {
  if (result === undefined || result === null) return false;
  let payload = result;
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (!trimmed) return false;
    if (/^Error executing tool\b/i.test(trimmed)) return false;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        payload = JSON.parse(trimmed);
      } catch {
        return true;
      }
    } else {
      return true;
    }
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const status = typeof payload.status === 'string' ? payload.status.toUpperCase() : '';
    if (status === 'UNAVAILABLE' || status === 'ERROR') return false;
    if (payload.error) return false;
  }
  return true;
}

/**
 * Deterministic MCP Tool Execution Cache (Tier 2).
 * Caches read-only API query outputs (Jira, GitHub, Notion, Google Calendar)
 * with short volatility TTLs to avoid redundant external network roundtrips.
 */
class ToolCache {
  constructor(capacity = 300) {
    this.capacity = capacity;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };

    // Register with centralized invalidator
    cacheInvalidator.registerToolInvalidator(({ type, domain }) => {
      if (type === 'all') {
        const count = this.cache.size;
        this.cache.clear();
        return count;
      }
      if (type === 'domain' && domain) {
        return this.invalidateDomain(domain);
      }
      if (type === 'document') {
        // Ingested documents/SOPs can mirror Notion content: drop Notion reads.
        return this.invalidateService('notion');
      }
      return 0;
    });
  }

  generateKey(toolName, args = {}) {
    const serializedArgs = typeof args === 'string' ? args : JSON.stringify(args || {});
    const hash = crypto.createHash('sha256').update(serializedArgs).digest('hex');
    return `tool:${toolName}:${hash}`;
  }

  getDefaultTtlSeconds(toolName = '') {
    const t = toolName.toLowerCase();
    if (t.includes('jira')) return 60; // 1 minute
    if (t.includes('github') || t.includes('pr') || t.includes('issue')) return 60; // 1 minute
    if (t.includes('notion')) return 120; // 2 minutes
    if (t.includes('calendar')) return 120; // 2 minutes
    if (t.includes('dora')) return 300; // 5 minutes
    return 60;
  }

  get(toolName, args = {}) {
    const key = this.generateKey(toolName, args);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses += 1;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses += 1;
      return null;
    }

    this.stats.hits += 1;
    debug({ module: 'toolCache', action: 'hit', toolName, key }, `Tool cache hit: ${toolName}`);
    return entry.result;
  }

  set(toolName, args = {}, result, ttlSeconds = null) {
    if (!isCacheableResult(result)) return;

    const key = this.generateKey(toolName, args);
    const ttl = (ttlSeconds !== null && ttlSeconds !== undefined) ? ttlSeconds : this.getDefaultTtlSeconds(toolName);
    const ttlMs = ttl * 1000;
    const now = Date.now();

    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions += 1;
      }
    }

    // Re-insert so Map order reflects recency (LRU eviction drops the oldest).
    this.cache.delete(key);
    this.cache.set(key, {
      toolName,
      service: CACHEABLE_READ_TOOLS[toolName] || null,
      result,
      cachedAt: now,
      expiresAt: now + ttlMs,
    });
  }

  invalidateTool(toolPrefix) {
    let count = 0;
    const prefix = `tool:${toolPrefix}`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count += 1;
      }
    }
    return count;
  }

  invalidateService(service) {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.service === service) {
        this.cache.delete(key);
        count += 1;
      }
    }
    return count;
  }

  /**
   * Invalidate by integration service (jira/github/...), agent domain
   * (dora/sprint/...) or raw tool-name prefix.
   */
  invalidateDomain(domain) {
    const d = String(domain || '').toLowerCase();
    if (!d) return 0;
    let count = 0;
    for (const service of DOMAIN_SERVICE_MAP[d] || []) {
      count += this.invalidateService(service);
    }
    count += this.invalidateTool(d);
    return count;
  }

  clear() {
    this.cache.clear();
  }

  /**
   * Wrap an async tool executor with automatic caching.
   * Pass { bypassRead: true } to skip the lookup but still refresh the entry.
   */
  async wrap(toolName, args, executorFn, ttlSeconds = null, { bypassRead = false } = {}) {
    if (!bypassRead) {
      const cached = this.get(toolName, args);
      if (cached !== null) {
        return cached;
      }
    }

    const result = await executorFn();
    this.set(toolName, args, result, ttlSeconds);
    return result;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRatio = total > 0 ? (this.stats.hits / total).toFixed(4) : '0.0000';
    return {
      size: this.cache.size,
      capacity: this.capacity,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRatio: Number(hitRatio),
    };
  }
}

export const toolCache = new ToolCache();
export default toolCache;

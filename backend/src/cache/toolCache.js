import crypto from 'crypto';
import { cacheInvalidator } from './cacheInvalidator.js';
import { debug, info, warn } from '../utils/logger.js';

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
        this.cache.clear();
      } else if (type === 'domain' && domain) {
        this.invalidateTool(domain);
      }
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
    if (result === undefined || result === null) return;

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

    this.cache.set(key, {
      toolName,
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

  /**
   * Wrap an async tool executor with automatic caching
   */
  async wrap(toolName, args, executorFn, ttlSeconds = null) {
    const cached = this.get(toolName, args);
    if (cached !== null) {
      return cached;
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

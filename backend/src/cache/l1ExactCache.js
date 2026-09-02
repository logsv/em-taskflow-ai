import crypto from 'crypto';
import { info, debug } from '../utils/logger.js';

/**
 * High-speed in-memory L1 LRU Cache for exact prompt matches.
 * Turnaround latency: < 2ms (bypasses Redis network hop and embedding calculation).
 */
class L1ExactCache {
  constructor(capacity = 500, defaultTtlMs = 300000) { // 5 minutes default TTL
    this.capacity = capacity;
    this.defaultTtlMs = defaultTtlMs;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
    };
  }

  normalizeQuery(query = '') {
    return String(query)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[?!.,;:]+$/, '');
  }

  generateKey(query, options = {}) {
    const normalized = this.normalizeQuery(query);
    const domain = options.domain || 'general';
    const userId = options.userId || '';
    const repo = options.repo || '';
    const docVersion = options.docVersion || 'v1';
    
    const hash = crypto
      .createHash('sha256')
      .update(`${domain}:${docVersion}:${repo}:${userId}:${normalized}`)
      .digest('hex');
    
    return `l1:${domain}:${hash}`;
  }

  get(query, options = {}) {
    const key = this.generateKey(query, options);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses += 1;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses += 1;
      return null;
    }

    // Refresh LRU ordering (re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits += 1;
    debug({ module: 'l1ExactCache', action: 'hit', key }, 'L1 exact cache hit (<2ms)');
    
    return {
      answer: entry.answer,
      sources: entry.sources,
      domain: entry.domain,
      cachedAt: entry.cachedAt,
      fromL1: true,
    };
  }

  set(query, answer, sources = [], options = {}) {
    if (!query || !answer) return;

    const key = this.generateKey(query, options);
    const ttlMs = options.ttlMs || this.defaultTtlMs;
    const now = Date.now();

    // Evict oldest entry if capacity reached
    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions += 1;
      }
    }

    this.cache.set(key, {
      answer,
      sources: Array.isArray(sources) ? sources : [],
      domain: options.domain || 'general',
      cachedAt: now,
      expiresAt: now + ttlMs,
    });
  }

  invalidateDomain(domain) {
    if (!domain) return 0;
    let count = 0;
    const prefix = `l1:${domain}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count += 1;
      }
    }
    this.stats.invalidations += count;
    debug({ module: 'l1ExactCache', action: 'invalidateDomain', domain, count }, `Invalidated ${count} L1 entries for domain: ${domain}`);
    return count;
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += size;
    info('L1 exact cache cleared');
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
      invalidations: this.stats.invalidations,
      hitRatio: Number(hitRatio),
    };
  }
}

export const l1ExactCache = new L1ExactCache();
export default l1ExactCache;

import { EventEmitter } from 'events';
import { l1ExactCache } from './l1ExactCache.js';
import { info, warn } from '../utils/logger.js';

/**
 * Centralized Event-Driven Cache Invalidator Bus.
 * Coordinates cross-tier invalidation (L1 In-Memory, L2 Redis, Tool Cache)
 * upon data mutations, document ingestion, and admin actions.
 */
class CacheInvalidator extends EventEmitter {
  constructor() {
    super();
    this.l2Invalidators = new Set();
    this.toolInvalidators = new Set();
  }

  registerL2Invalidator(fn) {
    if (typeof fn === 'function') {
      this.l2Invalidators.add(fn);
    }
  }

  registerToolInvalidator(fn) {
    if (typeof fn === 'function') {
      this.toolInvalidators.add(fn);
    }
  }

  async invalidateDomain(domain) {
    if (!domain) return;
    info(`🔄 Invalidating cache tier entries for domain: ${domain}`);

    // 1. Invalidate L1 Exact Cache
    const l1Count = l1ExactCache.invalidateDomain(domain);

    // 2. Invalidate registered L2 handlers (Redis)
    let l2Count = 0;
    for (const handler of this.l2Invalidators) {
      try {
        const res = await Promise.resolve(handler({ type: 'domain', domain }));
        if (typeof res === 'number') l2Count += res;
      } catch (err) {
        warn(`L2 domain invalidator error for ${domain}: ${err.message}`);
      }
    }

    this.emit('domainInvalidated', { domain, l1Count, l2Count, timestamp: Date.now() });
    return { domain, l1Count, l2Count };
  }

  async invalidateDocument(filename) {
    if (!filename) return;
    info(`📄 Document mutated (${filename}), triggering RAG cache invalidation`);

    // Invalidate RAG and SOP domains in L1
    const l1Rag = l1ExactCache.invalidateDomain('rag');
    const l1Sop = l1ExactCache.invalidateDomain('sop');

    // Invalidate L2 document-specific keys
    let l2Count = 0;
    for (const handler of this.l2Invalidators) {
      try {
        const res = await Promise.resolve(handler({ type: 'document', filename }));
        if (typeof res === 'number') l2Count += res;
      } catch (err) {
        warn(`L2 document invalidator error for ${filename}: ${err.message}`);
      }
    }

    this.emit('documentInvalidated', { filename, l1Count: l1Rag + l1Sop, l2Count, timestamp: Date.now() });
    return { filename, l1Count: l1Rag + l1Sop, l2Count };
  }

  async invalidateAll() {
    info('🧹 Invalidate all cache tiers requested');
    l1ExactCache.clear();

    for (const handler of this.l2Invalidators) {
      try {
        await Promise.resolve(handler({ type: 'all' }));
      } catch (err) {
        warn(`L2 clear-all error: ${err.message}`);
      }
    }

    for (const handler of this.toolInvalidators) {
      try {
        await Promise.resolve(handler({ type: 'all' }));
      } catch (err) {
        warn(`Tool cache clear-all error: ${err.message}`);
      }
    }

    this.emit('allInvalidated', { timestamp: Date.now() });
  }
}

export const cacheInvalidator = new CacheInvalidator();
export default cacheInvalidator;

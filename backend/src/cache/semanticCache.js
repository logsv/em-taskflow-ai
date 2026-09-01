import { Redis } from 'ioredis';
import { getBgeEmbeddings } from '../llm/index.js';
import { cacheInvalidator } from './cacheInvalidator.js';
import { info, warn, debug } from '../utils/logger.js';
import crypto from 'crypto';

let redisClient = null;
let isRedisAvailable = false;

// Fallback in-memory store if Redis is unavailable or offline
const inMemoryL2Cache = new Map();

// Domain-Aware Adaptive TTL Configuration (in seconds)
export const DOMAIN_TTL_MAP = {
  rag: 7 * 24 * 3600,       // 7 days (invalidated on doc events)
  sop: 7 * 24 * 3600,       // 7 days (policy/ADR docs)
  okr: 4 * 3600,            // 4 hours
  roadmap: 4 * 3600,        // 4 hours
  people: 1800,             // 30 minutes
  dora: 1800,               // 30 minutes
  sprint: 120,              // 2 minutes (high volatility)
  delivery: 120,            // 2 minutes (high volatility)
  general: 3600,            // 1 hour default
};

export const SIMILARITY_THRESHOLD = 0.95;

/**
 * Deterministic Entity Extractor for Dual-Gate Anti-Hallucination Filtering
 */
export function extractQueryEntities(text = '') {
  const q = String(text || '');
  const entities = {
    sprints: [],
    jiraKeys: [],
    users: [],
    quarters: [],
    prNumbers: [],
  };

  // Sprint numbers (e.g. "Sprint 42", "sprint 10")
  const sprintMatches = q.matchAll(/\bsprint\s*(\d+)\b/gi);
  for (const m of sprintMatches) {
    if (m[1]) entities.sprints.push(m[1].toLowerCase());
  }

  // Jira Issue Keys (e.g. "PROJ-1234", "ENG-402")
  const jiraMatches = q.matchAll(/\b([A-Z]{2,10}-\d+)\b/g);
  for (const m of jiraMatches) {
    if (m[1]) entities.jiraKeys.push(m[1].toUpperCase());
  }

  // User handles (e.g. "@alex", "@sarah_c")
  const userMatches = q.matchAll(/@([a-zA-Z0-9_\-\.]+)/g);
  for (const m of userMatches) {
    if (m[1]) entities.users.push(m[1].toLowerCase());
  }

  // Quarters (e.g. "Q3", "Q4 2026")
  const quarterMatches = q.matchAll(/\b(Q[1-4])(?:\s*(\d{4}))?\b/gi);
  for (const m of quarterMatches) {
    const qStr = m[2] ? `${m[1].toUpperCase()}_${m[2]}` : m[1].toUpperCase();
    entities.quarters.push(qStr);
  }

  // PR numbers (e.g. "PR #102", "pr 45")
  const prMatches = q.matchAll(/\b(?:pr|pull request|#)\s*(\d+)\b/gi);
  for (const m of prMatches) {
    if (m[1]) entities.prNumbers.push(m[1]);
  }

  return entities;
}

/**
 * Gate 2 Validation: Check whether extracted entities match between query and cached entry
 */
export function validateEntityAlignment(queryEntities, cachedEntities) {
  if (!queryEntities || !cachedEntities) return true;

  // Check Sprints
  if (queryEntities.sprints.length > 0) {
    if (cachedEntities.sprints.length === 0) return false;
    const match = queryEntities.sprints.some((s) => cachedEntities.sprints.includes(s));
    if (!match) return false;
  } else if (cachedEntities.sprints.length > 0) {
    return false;
  }

  // Check Jira Issue Keys
  if (queryEntities.jiraKeys.length > 0) {
    if (cachedEntities.jiraKeys.length === 0) return false;
    const match = queryEntities.jiraKeys.some((k) => cachedEntities.jiraKeys.includes(k));
    if (!match) return false;
  } else if (cachedEntities.jiraKeys.length > 0) {
    return false;
  }

  // Check Users
  if (queryEntities.users.length > 0) {
    if (cachedEntities.users.length === 0) return false;
    const match = queryEntities.users.some((u) => cachedEntities.users.includes(u));
    if (!match) return false;
  } else if (cachedEntities.users.length > 0) {
    return false;
  }

  // Check Quarters
  if (queryEntities.quarters.length > 0) {
    if (cachedEntities.quarters.length === 0) return false;
    const match = queryEntities.quarters.some((q) => cachedEntities.quarters.includes(q));
    if (!match) return false;
  } else if (cachedEntities.quarters.length > 0) {
    return false;
  }

  // Check PRs
  if (queryEntities.prNumbers.length > 0) {
    if (cachedEntities.prNumbers.length === 0) return false;
    const match = queryEntities.prNumbers.some((p) => cachedEntities.prNumbers.includes(p));
    if (!match) return false;
  } else if (cachedEntities.prNumbers.length > 0) {
    return false;
  }

  return true;
}

export function getTtlForDomain(domain = 'general') {
  const d = String(domain || 'general').toLowerCase();
  return DOMAIN_TTL_MAP[d] || DOMAIN_TTL_MAP.general;
}

export async function initSemanticCache() {
  const tryConnect = (url) => {
    return new Promise((resolve) => {
      const client = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 1) return null;
          return 100;
        }
      });
      client.on('connect', () => {
        client.removeAllListeners('error');
        resolve(client);
      });
      client.on('error', () => {
        client.disconnect();
        resolve(null);
      });
    });
  };

  let client = await tryConnect('redis://redis:6379');
  if (!client) {
    client = await tryConnect('redis://localhost:6379');
  }

  if (client) {
    redisClient = client;
    isRedisAvailable = true;
    info('Connected to Redis for semantic cache');
    redisClient.on('error', (err) => {
      warn(`Redis error: ${err.message}`);
      isRedisAvailable = false;
    });
  } else {
    debug('Redis connection unavailable, operating in-memory semantic cache fallback');
    isRedisAvailable = false;
  }

  // Register L2 invalidation handler with centralized bus
  cacheInvalidator.registerL2Invalidator(async ({ type, domain, filename }) => {
    if (type === 'all') {
      inMemoryL2Cache.clear();
      if (isRedisAvailable && redisClient) {
        try {
          const keys = await redisClient.keys('semcache:*');
          if (keys.length > 0) await redisClient.del(...keys);
        } catch (_e) {}
      }
    } else if (type === 'domain' && domain) {
      invalidateL2Domain(domain);
    } else if (type === 'document' && filename) {
      invalidateL2Document(filename);
    }
  });
}

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getQueryEmbedding(query) {
  const client = getBgeEmbeddings();
  const result = await client.embed([query]);
  if (!result.embeddings || result.embeddings.length === 0) {
    throw new Error('No embeddings returned');
  }
  return result.embeddings[0];
}

async function getCachedResponse(queryEmbedding, query, options = {}) {
  const domain = options.domain || 'rag';
  const queryEntities = extractQueryEntities(query);
  let bestMatch = null;
  let highestSimilarity = -1;

  // 1. Check Redis if available
  if (isRedisAvailable && redisClient) {
    try {
      // Domain-scoped key scan (avoids scanning entire Redis DB)
      const domainKeys = await redisClient.keys(`semcache:${domain}:*`);
      
      for (const key of domainKeys) {
        const dataStr = await redisClient.get(key);
        if (!dataStr) continue;
        const data = JSON.parse(dataStr);

        const similarity = cosineSimilarity(queryEmbedding, data.embedding);
        if (similarity >= SIMILARITY_THRESHOLD && similarity > highestSimilarity) {
          // Gate 2: Deterministic Entity Verification
          const entitiesAligned = validateEntityAlignment(queryEntities, data.entities);
          if (entitiesAligned) {
            highestSimilarity = similarity;
            bestMatch = data;
          } else {
            debug({ module: 'semanticCache', action: 'gate2_entity_mismatch', query, cachedQuery: data.query }, 'Rejected semantic match due to entity divergence');
          }
        }
      }

      if (bestMatch) {
        info(`Semantic cache hit [Domain: ${domain}] (similarity: ${highestSimilarity.toFixed(4)})`);
        return { answer: bestMatch.response, sources: bestMatch.sources, fromSemanticCache: true };
      }
    } catch (err) {
      warn(`Error reading from Redis semantic cache: ${err.message}`);
    }
  }

  // 2. In-Memory L2 Fallback
  const now = Date.now();
  for (const [key, data] of inMemoryL2Cache.entries()) {
    if (data.expiresAt && now > data.expiresAt) {
      inMemoryL2Cache.delete(key);
      continue;
    }
    if (data.domain && data.domain !== domain) continue;

    const similarity = cosineSimilarity(queryEmbedding, data.embedding);
    if (similarity >= SIMILARITY_THRESHOLD && similarity > highestSimilarity) {
      const entitiesAligned = validateEntityAlignment(queryEntities, data.entities);
      if (entitiesAligned) {
        highestSimilarity = similarity;
        bestMatch = data;
      }
    }
  }

  if (bestMatch) {
    debug(`In-memory semantic cache hit (similarity: ${highestSimilarity.toFixed(4)})`);
    return { answer: bestMatch.response, sources: bestMatch.sources, fromSemanticCache: true };
  }

  return null;
}

export async function checkSemanticCache(query, options = {}) {
  try {
    const queryEmbedding = await getQueryEmbedding(query);
    return await getCachedResponse(queryEmbedding, query, options);
  } catch (err) {
    debug(`checkSemanticCache bypass: ${err.message}`);
    return null;
  }
}

async function cacheResponse(queryEmbedding, query, response, sources, options = {}) {
  const domain = options.domain || 'rag';
  const ttlSeconds = options.ttlSeconds || getTtlForDomain(domain);
  const entities = extractQueryEntities(query);
  const hash = crypto.createHash('sha256').update(`${domain}:${query}`).digest('hex');
  const key = `semcache:${domain}:${hash}`;
  
  const data = {
    query,
    domain,
    embedding: queryEmbedding,
    response,
    sources: Array.isArray(sources) ? sources : [],
    entities,
    cachedAt: Date.now(),
    expiresAt: Date.now() + (ttlSeconds * 1000),
  };

  // 1. Write to Redis if available
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch (err) {
      warn(`Error writing to Redis semantic cache: ${err.message}`);
    }
  }

  // 2. Write to in-memory L2 store
  if (inMemoryL2Cache.size >= 1000) {
    const oldestKey = inMemoryL2Cache.keys().next().value;
    if (oldestKey) inMemoryL2Cache.delete(oldestKey);
  }
  inMemoryL2Cache.set(key, data);
}

export async function setSemanticCache(query, response, sources, options = {}) {
  try {
    const queryEmbedding = await getQueryEmbedding(query);
    await cacheResponse(queryEmbedding, query, response, sources, options);
  } catch (err) {
    debug(`setSemanticCache bypass: ${err.message}`);
  }
}

export function invalidateL2Domain(domain) {
  let count = 0;
  const prefix = `semcache:${domain}:`;
  for (const key of inMemoryL2Cache.keys()) {
    if (key.startsWith(prefix)) {
      inMemoryL2Cache.delete(key);
      count += 1;
    }
  }
  if (isRedisAvailable && redisClient) {
    redisClient.keys(`${prefix}*`).then((keys) => {
      if (keys && keys.length > 0) redisClient.del(...keys).catch(() => {});
    }).catch(() => {});
  }
  return count;
}

export function invalidateL2Document(filename) {
  let count = 0;
  for (const [key, data] of inMemoryL2Cache.entries()) {
    const hasDoc = (data.sources || []).some((s) => String(s.metadata?.filename || s.filename || '').includes(filename));
    if (hasDoc) {
      inMemoryL2Cache.delete(key);
      count += 1;
    }
  }
  return count;
}

export function getSemanticCacheStats() {
  return {
    isRedisAvailable,
    inMemoryEntriesCount: inMemoryL2Cache.size,
    similarityThreshold: SIMILARITY_THRESHOLD,
    domainTtlSettings: DOMAIN_TTL_MAP,
  };
}

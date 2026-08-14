import { Redis } from 'ioredis';
import { getBgeEmbeddings } from '../llm/index.js';
import { info, warn, error } from '../utils/logger.js';
import crypto from 'crypto';

let redisClient = null;
let isRedisAvailable = false;
const TTL_SECONDS = 3600;
const SIMILARITY_THRESHOLD = 0.95;

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
    warn('Redis connection failed, gracefully degrading semantic cache');
    isRedisAvailable = false;
  }
}

function cosineSimilarity(vecA, vecB) {
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

async function getCachedResponse(queryEmbedding) {
  if (!isRedisAvailable || !redisClient) return null;
  try {
    const keys = await redisClient.keys('semantic_cache:*');
    let bestMatch = null;
    let highestSimilarity = -1;

    for (const key of keys) {
      const dataStr = await redisClient.get(key);
      if (!dataStr) continue;
      const data = JSON.parse(dataStr);
      
      const similarity = cosineSimilarity(queryEmbedding, data.embedding);
      if (similarity >= SIMILARITY_THRESHOLD && similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = data;
      }
    }
    
    if (bestMatch) {
      info(`Semantic cache hit (similarity: ${highestSimilarity.toFixed(4)})`);
      return { answer: bestMatch.response, sources: bestMatch.sources };
    }
  } catch (err) {
    warn(`Error reading from semantic cache: ${err.message}`);
  }
  return null;
}

export async function checkSemanticCache(query) {
  if (!isRedisAvailable) return null;
  try {
    const queryEmbedding = await getQueryEmbedding(query);
    return await getCachedResponse(queryEmbedding);
  } catch (err) {
    warn(`Error in checkSemanticCache: ${err.message}`);
    return null;
  }
}

async function cacheResponse(queryEmbedding, query, response, sources) {
  if (!isRedisAvailable || !redisClient) return;
  try {
    const hash = crypto.createHash('sha256').update(query).digest('hex');
    const key = `semantic_cache:${hash}`;
    const data = {
      query,
      embedding: queryEmbedding,
      response,
      sources
    };
    await redisClient.set(key, JSON.stringify(data), 'EX', TTL_SECONDS);
  } catch (err) {
    warn(`Error writing to semantic cache: ${err.message}`);
  }
}

export async function setSemanticCache(query, response, sources) {
  if (!isRedisAvailable) return;
  try {
    const queryEmbedding = await getQueryEmbedding(query);
    await cacheResponse(queryEmbedding, query, response, sources);
  } catch (err) {
    warn(`Error in setSemanticCache: ${err.message}`);
  }
}

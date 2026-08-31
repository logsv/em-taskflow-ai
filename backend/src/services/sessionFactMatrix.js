import databaseService from '../db/postgres.js';
import { info, warn } from '../utils/logger.js';
import { Redis } from 'ioredis';

const inMemoryFactMatrices = new Map();
let redisClient = null;
let isRedisAvailable = false;
const REDIS_KEY_PREFIX = 'thread:fact_matrix:';
const TTL_SECONDS = 86400; // 24 hours

export async function initFactMatrixRedis() {
  const tryConnect = (url) => {
    return new Promise((resolve) => {
      const client = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 1) return null;
          return 100;
        },
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

  try {
    let client = await tryConnect('redis://redis:6379');
    if (!client) {
      client = await tryConnect('redis://localhost:6379');
    }
    if (client) {
      redisClient = client;
      isRedisAvailable = true;
      info('Connected to Redis for Distributed Session Fact-Matrix cache');
      redisClient.on('error', (err) => {
        warn(`Redis Fact-Matrix error: ${err?.message}`);
        isRedisAvailable = false;
      });
    }
  } catch (_e) {
    isRedisAvailable = false;
  }
}

export class SessionFactMatrixService {
  constructor({ db = databaseService } = {}) {
    this.db = db;
  }

  /**
   * Retrieves the structured Fact Matrix for a thread across Redis, Postgres, and in-memory fallback.
   * @param {string} threadId
   * @returns {Promise<Object>}
   */
  async getThreadFactMatrix(threadId) {
    if (!threadId) return {};

    // 1. Check in-memory store
    if (inMemoryFactMatrices.has(threadId)) {
      return inMemoryFactMatrices.get(threadId);
    }

    // 2. Check Redis cache
    if (isRedisAvailable && redisClient) {
      try {
        const cached = await redisClient.get(`${REDIS_KEY_PREFIX}${threadId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          inMemoryFactMatrices.set(threadId, parsed);
          return parsed;
        }
      } catch (_err) {}
    }

    // 3. Check PostgreSQL database
    try {
      const dbMatrix = await this.db.getThreadContextMatrix(threadId);
      if (dbMatrix && typeof dbMatrix === 'object' && Object.keys(dbMatrix).length > 0) {
        inMemoryFactMatrices.set(threadId, dbMatrix);
        if (isRedisAvailable && redisClient) {
          redisClient.setex(`${REDIS_KEY_PREFIX}${threadId}`, TTL_SECONDS, JSON.stringify(dbMatrix)).catch(() => {});
        }
        return dbMatrix;
      }
    } catch (_err) {}

    return {};
  }

  /**
   * Saves and broadcasts the updated Fact Matrix across in-memory, Redis, and PostgreSQL.
   * @param {string} threadId
   * @param {Object} matrix
   * @returns {Promise<Object>}
   */
  async saveThreadFactMatrix(threadId, matrix = {}) {
    if (!threadId || typeof matrix !== 'object') return matrix;

    inMemoryFactMatrices.set(threadId, matrix);

    if (isRedisAvailable && redisClient) {
      redisClient.setex(`${REDIS_KEY_PREFIX}${threadId}`, TTL_SECONDS, JSON.stringify(matrix)).catch(() => {});
    }

    try {
      await this.db.updateThreadContextMatrix(threadId, matrix);
    } catch (err) {
      warn('Failed to persist Fact Matrix in PostgreSQL', { threadId, err: err?.message });
    }

    return matrix;
  }

  /**
   * Deterministically extracts facts, metrics, entities, and agreed action items from a conversational turn.
   * @param {string} userQuery
   * @param {string} assistantResponse
   * @param {Object} routingPlan
   * @returns {Object} Extracted delta
   */
  extractFactDelta(userQuery = '', assistantResponse = '', routingPlan = {}) {
    const q = String(userQuery || '');
    const a = String(assistantResponse || '');
    const delta = {};

    // 1. Repository extraction
    const repoMatch = a.match(/(?:DORA Performance Scorecard:\s*\[\*\*|Scorecard:\s*\[\*\*|in\s+repository\s+)([a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+)/i) ||
      q.match(/([a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+)/);
    if (repoMatch && repoMatch[1] && !repoMatch[1].startsWith('http')) {
      delta.repository = repoMatch[1];
    }

    // 2. DORA metrics extraction
    const deployMatch = a.match(/(?:Deployment Frequency\*\*?\s*\|\s*\*\*?)([0-9.]+\s*deploys?\/week)/i);
    const leadTimeMatch = a.match(/(?:Lead Time for Changes\*\*?\s*\|\s*\*\*?)([0-9.]+\s*hours)/i);
    const cfrMatch = a.match(/(?:Change Failure Rate\*\*?\s*\|\s*\*\*?)([0-9.]+\s*%)/i);
    const mttrMatch = a.match(/(?:Time to Restore \(MTTR\)\*\*?|MTTR\*\*?)\s*\|\s*\*\*?([0-9.]+\s*hours)/i);
    const tierMatch = a.match(/\b(ELITE|HIGH|MEDIUM|LOW)\s+Tier\b/i) ||
      a.match(/(?:Overall operational flow is rated at\s*\*+|rated at\s*\*+)([A-Za-z]+)\s*Tier/i);

    if (deployMatch || leadTimeMatch || cfrMatch || mttrMatch || tierMatch) {
      delta.dora = {
        ...(deployMatch ? { deploymentFrequency: deployMatch[1] } : {}),
        ...(leadTimeMatch ? { leadTimeHours: leadTimeMatch[1] } : {}),
        ...(cfrMatch ? { changeFailureRate: cfrMatch[1] } : {}),
        ...(mttrMatch ? { mttrHours: mttrMatch[1] } : {}),
        ...(tierMatch ? { tier: (tierMatch[1] || tierMatch[0]).replace(/\s*Tier/i, '').replace(/[*_`]/g, '').trim().toUpperCase() } : {}),
      };
    }

    // 3. Bottlenecks extraction
    const bottlenecks = [];
    const reviewWaitMatch = a.match(/Review Queue Latency\*\*?:\s*Pull requests average \*\*([0-9.]+\s*h(?:ours)?)\*\*/i) ||
      a.match(/PR review latency averages ([0-9.]+h)/i);
    if (reviewWaitMatch) {
      bottlenecks.push(`PR review latency avg ${reviewWaitMatch[1]}`);
    }
    const ciMatch = a.match(/CI Pipeline Duration\*\*?:\s*Build & test automation accounts for \*\*~?([0-9.]+\s*minutes?)\*\*/i);
    if (ciMatch) {
      bottlenecks.push(`CI pipeline duration ~${ciMatch[1]}`);
    }
    if (bottlenecks.length > 0) {
      delta.bottlenecks = bottlenecks;
    }

    // 4. Engineers & Pull Requests extraction
    const engineers = new Set();
    const prs = new Set();

    const prMatches = [...a.matchAll(/#(\d{1,6})/g), ...q.matchAll(/#(\d{1,6})/g)];
    for (const m of prMatches) {
      prs.add(`#${m[1]}`);
    }

    const engineerMatches = [
      ...a.matchAll(/@([a-zA-Z0-9_\-\.]+)/g),
      ...q.matchAll(/@([a-zA-Z0-9_\-\.]+)/g),
      ...a.matchAll(/for engineer\s*[`*"]?([a-zA-Z0-9_\-\.]+)[`*"]?/gi),
      ...q.matchAll(/for engineer\s*[`*"]?([a-zA-Z0-9_\-\.]+)[`*"]?/gi),
    ];
    for (const m of engineerMatches) {
      const name = m[1].replace(/[*_`]/g, '').trim();
      if (name && !['here', 'channel', 'everyone', 'DORA', 'OKR', 'SBI', 'HIGH', 'LOW', 'PR'].includes(name)) {
        engineers.add(`@${name.replace(/^@/, '')}`);
      }
    }

    if (engineers.size > 0) delta.engineers = Array.from(engineers);
    if (prs.size > 0) delta.prs = Array.from(prs);

    // 5. Strategic Action Items & Decisions extraction
    const actionItems = [];
    const actionLines = a.match(/^\s*\d+\.\s+\*\*([^*]+)\*\*:\s*([^\r\n]+)/gm);
    if (actionLines) {
      for (const line of actionLines.slice(0, 3)) {
        const clean = line.replace(/^\s*\d+\.\s+/, '').replace(/[*_`]/g, '').trim();
        if (clean.length > 10 && clean.length < 120) {
          actionItems.push(clean);
        }
      }
    }
    if (actionItems.length > 0) {
      delta.actionItems = actionItems;
    }

    // 6. Sprint & OKR extraction
    const sprintMatch = a.match(/Sprint\s*(\d{1,4})/i) || q.match(/Sprint\s*(\d{1,4})/i);
    const capacityMatch = a.match(/(?:capacity|velocity)\s*(?:is\s*at|is|at|of|reached)?\s*(\d{1,4})\s*(?:story points|pts|points)/i);
    if (sprintMatch || capacityMatch) {
      delta.sprint = {
        ...(sprintMatch ? { sprintName: `Sprint ${sprintMatch[1]}` } : {}),
        ...(capacityMatch ? { capacity: `${capacityMatch[1]} pts` } : {}),
      };
    }

    return delta;
  }

  /**
   * Merges an incremental delta into the existing session Fact Matrix.
   * @param {Object} current
   * @param {Object} delta
   * @returns {Object}
   */
  mergeFactMatrix(current = {}, delta = {}) {
    const merged = { ...current };

    if (delta.repository) merged.repository = delta.repository;
    if (delta.dora) merged.dora = { ...(merged.dora || {}), ...delta.dora };
    if (Array.isArray(delta.bottlenecks)) {
      merged.bottlenecks = Array.from(new Set([...(merged.bottlenecks || []), ...delta.bottlenecks])).slice(-4);
    }
    if (Array.isArray(delta.engineers)) {
      merged.engineers = Array.from(new Set([...(merged.engineers || []), ...delta.engineers])).slice(-6);
    }
    if (Array.isArray(delta.prs)) {
      merged.prs = Array.from(new Set([...(merged.prs || []), ...delta.prs])).slice(-6);
    }
    if (Array.isArray(delta.actionItems)) {
      merged.actionItems = Array.from(new Set([...(merged.actionItems || []), ...delta.actionItems])).slice(-4);
    }
    if (delta.sprint) merged.sprint = { ...(merged.sprint || {}), ...delta.sprint };

    return merged;
  }

  /**
   * Formats the Fact Matrix into a clean, ultra-compact YAML system memory block (<=120 tokens).
   * @param {Object} matrix
   * @returns {string}
   */
  formatMatrixAsSystemPrompt(matrix = {}) {
    if (!matrix || typeof matrix !== 'object' || Object.keys(matrix).length === 0) {
      return '';
    }

    const lines = ['[System Memory: Active Session Fact Matrix]'];

    if (matrix.repository) {
      lines.push(`Repository: ${matrix.repository}`);
    }

    if (matrix.dora) {
      const d = matrix.dora;
      const parts = [];
      if (d.deploymentFrequency) parts.push(`Deploys: ${d.deploymentFrequency}`);
      if (d.leadTimeHours) parts.push(`LeadTime: ${d.leadTimeHours}`);
      if (d.changeFailureRate) parts.push(`CFR: ${d.changeFailureRate}`);
      if (d.mttrHours) parts.push(`MTTR: ${d.mttrHours}`);
      if (d.tier) parts.push(`Rating: ${d.tier} Tier`);
      if (parts.length > 0) {
        lines.push(`DORA Baseline: ${parts.join(' | ')}`);
      }
    }

    if (Array.isArray(matrix.bottlenecks) && matrix.bottlenecks.length > 0) {
      lines.push(`Identified Bottlenecks: ${matrix.bottlenecks.join(' | ')}`);
    }

    if (Array.isArray(matrix.engineers) && matrix.engineers.length > 0) {
      lines.push(`Active Engineers: ${matrix.engineers.join(', ')}`);
    }

    if (Array.isArray(matrix.prs) && matrix.prs.length > 0) {
      lines.push(`Referenced PRs: ${matrix.prs.join(', ')}`);
    }

    if (Array.isArray(matrix.actionItems) && matrix.actionItems.length > 0) {
      lines.push(`Agreed Action Items: ${matrix.actionItems.join(' | ')}`);
    }

    if (matrix.sprint) {
      const s = matrix.sprint;
      const sParts = [];
      if (s.sprintName) sParts.push(s.sprintName);
      if (s.capacity) sParts.push(`Capacity: ${s.capacity}`);
      if (sParts.length > 0) {
        lines.push(`Sprint Status: ${sParts.join(' | ')}`);
      }
    }

    return lines.length > 1 ? lines.join('\n') : '';
  }
}

const sessionFactMatrixService = new SessionFactMatrixService();
export default sessionFactMatrixService;
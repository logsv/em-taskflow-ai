import databaseService from '../db/postgres.js';
import { info, warn } from '../utils/logger.js';

/**
 * Tier 4: Episodic Semantic Memory Retrieval
 * Searches past thread messages in PostgreSQL for long-running conversations
 * when a user refers to past discussions outside the active sliding window.
 */
export class EpisodicMemoryService {
  constructor({ db = databaseService } = {}) {
    this.db = db;
  }

  /**
   * Retrieves relevant historical message snippets if query references past conversation.
   * @param {string} query
   * @param {string} threadId
   * @param {number} limit
   * @returns {Promise<Array<{ role: string, content: string, createdAt: string }>>}
   */
  async retrieveRelevantPastContext(query = '', threadId = null, limit = 2) {
    if (!threadId || !query || query.trim().length < 5) {
      return [];
    }

    const q = String(query).toLowerCase();
    const isPastReference =
      /\b(earlier|previously|before|we discussed|you mentioned|as said|in the beginning|last time)\b/i.test(q) ||
      /\bwhat was\b/i.test(q);

    if (!isPastReference) {
      return [];
    }

    try {
      // Query past messages for this thread excluding the most recent 6 messages
      const allMessages = await this.db.getThreadMessages(threadId, 50).catch(() => []);
      if (!Array.isArray(allMessages) || allMessages.length <= 6) {
        return [];
      }

      const olderMessages = allMessages.slice(0, -6);
      const queryTerms = q
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 3 && !['what', 'when', 'where', 'which', 'about', 'earlier', 'discussed', 'mentioned'].includes(t));

      if (queryTerms.length === 0) {
        return [];
      }

      // Rank older messages by term match density
      const scored = olderMessages.map((msg) => {
        const text = String(msg.content || '').toLowerCase();
        let matches = 0;
        for (const term of queryTerms) {
          if (text.includes(term)) matches += 1;
        }
        return { msg, score: matches };
      });

      const relevant = scored
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => ({
          role: item.msg.role,
          content: String(item.msg.content || '').slice(0, 300),
          createdAt: item.msg.created_at,
        }));

      if (relevant.length > 0) {
        info('Episodic memory retrieved relevant past context', {
          threadId,
          count: relevant.length,
        });
      }

      return relevant;
    } catch (err) {
      warn('Episodic memory retrieval failed gracefully', { err: err.message });
      return [];
    }
  }
}

const episodicMemoryService = new EpisodicMemoryService();
export default episodicMemoryService;

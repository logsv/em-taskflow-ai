import db from '../../db/index.js';

/**
 * Compatibility repository for legacy chat_history access.
 * Avoid using this for new chat flows; use thread/message persistence instead.
 */
export class LegacyChatHistoryRepository {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  save(userMessage, aiResponse, sessionId = null, metadata = null) {
    return this.db.saveChatHistory(userMessage, aiResponse, sessionId, metadata);
  }

  list(limit = 50, sessionId = null) {
    return this.db.getChatHistory(limit, sessionId);
  }
}

const legacyChatHistoryRepository = new LegacyChatHistoryRepository();
export default legacyChatHistoryRepository;

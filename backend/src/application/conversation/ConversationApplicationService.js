import db from '../../db/index.js';

export class ConversationApplicationService {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  async listThreads({ limit = 50, requestId = null }) {
    const threads = await this.db.listThreads(limit);
    return {
      threads,
      requestId,
    };
  }

  async getThreadMessages({ threadId, limit = 100, requestId = null }) {
    const messages = await this.db.getThreadMessages(threadId, limit);
    return {
      threadId,
      messages,
      requestId,
    };
  }
}

const conversationApplicationService = new ConversationApplicationService();
export default conversationApplicationService;

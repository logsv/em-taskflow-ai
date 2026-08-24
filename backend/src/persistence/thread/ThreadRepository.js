import db from '../../db/index.js';

export class ThreadRepository {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  ensureThread(threadId, title, sessionId = null) {
    return this.db.ensureThread(threadId, title, sessionId);
  }

  listThreads(limit = 50) {
    return this.db.listThreads(limit);
  }

  updateThreadTitle(threadId, title) {
    if (typeof this.db?.updateThreadTitle === 'function') {
      return this.db.updateThreadTitle(threadId, title);
    }
    return null;
  }
}

const threadRepository = new ThreadRepository();
export default threadRepository;

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

  getThreadContextMatrix(threadId) {
    if (typeof this.db?.getThreadContextMatrix === 'function') {
      return this.db.getThreadContextMatrix(threadId);
    }
    return null;
  }

  updateThreadContextMatrix(threadId, contextMatrix) {
    if (typeof this.db?.updateThreadContextMatrix === 'function') {
      return this.db.updateThreadContextMatrix(threadId, contextMatrix);
    }
    return null;
  }
}

const threadRepository = new ThreadRepository();
export default threadRepository;

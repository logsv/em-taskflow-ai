import db from '../../db/index.js';

export class SessionRepository {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  getSession(sessionId) {
    return this.db.getSession(sessionId);
  }

  createSession(clientInfo) {
    return this.db.createSession(clientInfo);
  }

  touchSession(sessionId) {
    return this.db.touchSession(sessionId);
  }

  getOrCreateActiveThread(sessionId) {
    return this.db.getOrCreateActiveThread(sessionId);
  }
}

const sessionRepository = new SessionRepository();
export default sessionRepository;

import db from '../../db/index.js';

export class MessageRepository {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  saveMessage(input) {
    return this.db.saveMessage(input);
  }

  getThreadMessages(threadId, limit = 100) {
    return this.db.getThreadMessages(threadId, limit);
  }
}

const messageRepository = new MessageRepository();
export default messageRepository;

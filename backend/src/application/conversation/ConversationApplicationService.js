import threadRepository from '../../persistence/thread/ThreadRepository.js';
import messageRepository from '../../persistence/message/MessageRepository.js';

export class ConversationApplicationService {
  constructor({ threadRepo = null, messageRepo = null, dbService = null } = {}) {
    this.threadRepo = threadRepo || createThreadRepoAdapter(dbService);
    this.messageRepo = messageRepo || createMessageRepoAdapter(dbService);
  }

  async listThreads({ limit = 50, requestId = null }) {
    const threads = await this.threadRepo.listThreads(limit);
    return {
      threads,
      requestId,
    };
  }

  async getThreadMessages({ threadId, limit = 100, requestId = null }) {
    const messages = await this.messageRepo.getThreadMessages(threadId, limit);
    return {
      threadId,
      messages,
      requestId,
    };
  }
}

const conversationApplicationService = new ConversationApplicationService();
export default conversationApplicationService;

function createThreadRepoAdapter(dbService) {
  if (!dbService) {
    return threadRepository;
  }

  return {
    listThreads: (...args) => dbService.listThreads(...args),
  };
}

function createMessageRepoAdapter(dbService) {
  if (!dbService) {
    return messageRepository;
  }

  return {
    getThreadMessages: (...args) => dbService.getThreadMessages(...args),
  };
}

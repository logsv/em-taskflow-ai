import feedbackRepository from '../../persistence/feedback/FeedbackRepository.js';

export class FeedbackApplicationService {
  constructor({ feedbackRepo = null, dbService = null } = {}) {
    this.feedbackRepo = feedbackRepo || createFeedbackRepoAdapter(dbService);
  }

  async submitFeedback({ payload, sessionContext = null, requestId = null }) {
    const { messageId, threadId, traceId, score, comment } = payload;
    const feedback = await this.feedbackRepo.createFeedback({
      sessionId: sessionContext?.sessionId || null,
      threadId: threadId || sessionContext?.threadId || null,
      messageId: messageId || null,
      traceId: traceId || null,
      score,
      comment: comment || null,
      metadata: {
        requestId,
      },
    });

    return {
      status: 'success',
      feedbackId: feedback.id,
      requestId,
    };
  }
}

const feedbackApplicationService = new FeedbackApplicationService();
export default feedbackApplicationService;

function createFeedbackRepoAdapter(dbService) {
  if (!dbService) {
    return feedbackRepository;
  }

  return {
    createFeedback: (...args) => dbService.createFeedback(...args),
  };
}

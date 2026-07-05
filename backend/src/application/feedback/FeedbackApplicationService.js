import db from '../../db/index.js';

export class FeedbackApplicationService {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  async submitFeedback({ payload, sessionContext = null, requestId = null }) {
    const { messageId, threadId, traceId, score, comment } = payload;
    const feedback = await this.db.createFeedback({
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

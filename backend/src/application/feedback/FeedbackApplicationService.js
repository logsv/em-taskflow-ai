import feedbackRepository from '../../persistence/feedback/FeedbackRepository.js';
import { resolveLangfuseBaseUrl } from '../../utils/tracer.js';

export class FeedbackApplicationService {
  constructor({ feedbackRepo = null, dbService = null } = {}) {
    this.feedbackRepo = feedbackRepo || createFeedbackRepoAdapter(dbService);
  }

  async submitFeedback({ payload, sessionContext = null, requestId = null }) {
    const { messageId, threadId, traceId, score, comment } = payload;
    const targetTraceId = traceId || threadId || sessionContext?.threadId || null;

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

    if (targetTraceId && process.env.LANGFUSE_PUBLIC_KEY) {
      // Non-blocking telemetry as mandated by AGENTS.md Rule of Zero-Downtime Telemetry
      import('langfuse').then(({ Langfuse }) => {
        const baseUrl = resolveLangfuseBaseUrl();
        const langfuse = new Langfuse({
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          baseUrl,
          flushAt: 1,
          flushInterval: 1000,
        });

        const numericScore = typeof score === 'number' 
          ? score 
          : (score === 'thumbs_up' || score === 'like' || score === 1 || score === '1' ? 1.0 : 0.0);

        // Ensure parent trace is registered in Langfuse so trace/score navigation in UI never errors with Not Found
        langfuse.trace({
          id: targetTraceId,
          name: 'user_conversation_feedback',
          sessionId: sessionContext?.sessionId || threadId || undefined,
          userId: sessionContext?.userId || 'default_user',
          metadata: {
            messageId,
            threadId,
            requestId,
          },
        });

        langfuse.score({
          traceId: targetTraceId,
          name: 'user_feedback',
          value: numericScore,
          comment: comment || (numericScore === 1.0 ? 'Thumbs Up' : 'Thumbs Down'),
        });
        return langfuse.flushAsync().then(() => {
          console.log(`✅ Langfuse feedback score (${numericScore}) logged successfully for trace: ${targetTraceId}`);
        });
      }).catch((error) => {
        console.warn(`⚠️ Failed to submit feedback to Langfuse:`, error?.message || error);
      });
    }

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

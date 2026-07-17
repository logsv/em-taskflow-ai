import sinon from 'sinon';
import { Client } from 'langsmith';
import { FeedbackApplicationService } from '../../src/application/feedback/FeedbackApplicationService.js';

describe('FeedbackApplicationService', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('stores feedback with session-aware defaults and returns the normalized payload', async () => {
    const dbService = {
      createFeedback: jasmine.createSpy('createFeedback').and.resolveTo({
        id: 'fb_123',
      }),
    };
    const service = new FeedbackApplicationService({ dbService });

    const result = await service.submitFeedback({
      payload: {
        messageId: 42,
        score: 'thumbs_up',
        comment: 'Useful answer',
      },
      sessionContext: {
        sessionId: 'sess_123',
        threadId: 'th_123',
      },
      requestId: 'req_feedback',
    });

    expect(dbService.createFeedback).toHaveBeenCalledWith({
      sessionId: 'sess_123',
      threadId: 'th_123',
      messageId: 42,
      traceId: null,
      score: 'thumbs_up',
      comment: 'Useful answer',
      metadata: {
        requestId: 'req_feedback',
      },
    });
    expect(result).toEqual({
      status: 'success',
      feedbackId: 'fb_123',
      requestId: 'req_feedback',
    });
  });

  it('prefers explicit thread and trace values when provided', async () => {
    const dbService = {
      createFeedback: jasmine.createSpy('createFeedback').and.resolveTo({
        id: 'fb_999',
      }),
    };
    const service = new FeedbackApplicationService({ dbService });

    await service.submitFeedback({
      payload: {
        threadId: 'th_explicit',
        traceId: 'trace_123',
        score: 'thumbs_down',
      },
      sessionContext: {
        sessionId: 'sess_456',
        threadId: 'th_session',
      },
      requestId: 'req_feedback_2',
    });

    expect(dbService.createFeedback).toHaveBeenCalledWith({
      sessionId: 'sess_456',
      threadId: 'th_explicit',
      messageId: null,
      traceId: 'trace_123',
      score: 'thumbs_down',
      comment: null,
      metadata: {
        requestId: 'req_feedback_2',
      },
    });
  });

  it('submits feedback to LangSmith when traceId and LANGCHAIN_API_KEY are present', async () => {
    const originalApiKey = process.env.LANGCHAIN_API_KEY;
    process.env.LANGCHAIN_API_KEY = 'test-key';

    const createFeedbackSpy = sandbox.stub(Client.prototype, 'createFeedback').resolves({});
    
    const dbService = {
      createFeedback: () => ({ id: 'fb_123' }),
    };
    const service = new FeedbackApplicationService({ dbService });

    await service.submitFeedback({
      payload: {
        traceId: 'trace_abc',
        score: 'thumbs_up',
        comment: 'Nice!',
      },
    });

    expect(createFeedbackSpy.calledOnceWith('trace_abc', 'user_score', {
      score: 1.0,
      value: 'thumbs_up',
      comment: 'Nice!',
    })).toBe(true);

    process.env.LANGCHAIN_API_KEY = originalApiKey;
  });
});

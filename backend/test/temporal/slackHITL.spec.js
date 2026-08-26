import express from 'express';
import supertest from 'supertest';
import axios from 'axios';
import { postSlackMessageActivity } from '../../src/temporal/activities.js';
import {
  startSlackPostHITLWorkflow,
  signalSlackPostApproval,
} from '../../src/temporal/client.js';
import adminRoutes from '../../src/routes/admin.js';

describe('Temporal Human-in-the-Loop (HITL) Slack Post Specs', () => {
  let app;
  let request;
  let originalPost;

  beforeEach(() => {
    originalPost = axios.post;
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    request = supertest(app);
  });

  afterEach(() => {
    axios.post = originalPost;
  });

  describe('1. postSlackMessageActivity', () => {
    it('should simulate Slack post when token is unconfigured', async () => {
      delete process.env.SLACK_BOT_TOKEN;
      const res = await postSlackMessageActivity({
        channel: '#engineering-retro',
        message: 'Sprint action items',
        approver: 'Alex (EM)',
        bot_token: '',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('SIMULATED');
      expect(res.channel).toBe('#engineering-retro');
      expect(res.ts).toBeDefined();
    });

    it('should execute live post via axios when token is configured', async () => {
      process.env.SLACK_BOT_TOKEN = 'xoxb-test-valid-bot-token';
      axios.post = jasmine.createSpy('axios.post').and.returnValue(
        Promise.resolve({
          data: {
            ok: true,
            channel: 'C0123456',
            ts: '1700000099.000100',
          },
        })
      );

      const res = await postSlackMessageActivity({
        channel: '#engineering-retro',
        message: 'Action Item: Fix CI flakiness',
        approver: 'Sarah Chen',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('SUCCESS');
      expect(res.ts).toBe('1700000099.000100');
      expect(res.approver).toBe('Sarah Chen');

      delete process.env.SLACK_BOT_TOKEN;
    });

    it('should handle Slack API error gracefully in activity', async () => {
      process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
      axios.post = jasmine.createSpy('axios.post').and.returnValue(
        Promise.resolve({
          data: {
            ok: false,
            error: 'channel_not_found',
          },
        })
      );

      const res = await postSlackMessageActivity({
        channel: '#non-existent-channel',
        message: 'Test Message',
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error).toBe('channel_not_found');

      delete process.env.SLACK_BOT_TOKEN;
    });
  });

  describe('2. Temporal Client HITL Methods', () => {
    it('startSlackPostHITLWorkflow should return a PENDING_HUMAN_APPROVAL handle', async () => {
      const res = await startSlackPostHITLWorkflow({
        channel: '#engineering-retro',
        message: 'Draft Retrospective Plan',
        sprintName: 'Sprint 42',
      });

      expect(res.status).toBe('PENDING_HUMAN_APPROVAL');
      expect(res.workflowId).toContain('slack-post-hitl-');
      expect(res.channel).toBe('#engineering-retro');
      expect(res.message).toBe('Draft Retrospective Plan');
    });

    it('signalSlackPostApproval should dispatch approval signal', async () => {
      const workflowId = `slack-post-hitl-${Date.now()}`;
      const res = await signalSlackPostApproval(workflowId, {
        approved: true,
        approver: 'Sarah Chen (EM)',
        targetChannel: '#announcements',
      });

      expect(res.workflowId).toBe(workflowId);
      expect(res.signalSent).toBe(true);
      expect(res.approved).toBe(true);
    });

    it('signalSlackPostApproval should dispatch rejection signal', async () => {
      const workflowId = `slack-post-hitl-${Date.now()}`;
      const res = await signalSlackPostApproval(workflowId, {
        approved: false,
        approver: 'Alex Williams',
        reason: 'Action items need further refinement',
      });

      expect(res.workflowId).toBe(workflowId);
      expect(res.signalSent).toBe(true);
      expect(res.approved).toBe(false);
    });
  });

  describe('3. Admin Express Temporal HITL Endpoints', () => {
    it('POST /api/admin/temporal/slack-post/request should initiate draft post', async () => {
      const res = await request
        .post('/api/admin/temporal/slack-post/request')
        .send({
          message: 'Draft Retrospective Action Plan',
          channel: '#engineering-retro',
          sprintName: 'Sprint 42',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.workflowId).toBeDefined();
      expect(res.body.status).toBe('PENDING_HUMAN_APPROVAL');
    });

    it('POST /api/admin/temporal/slack-post/request should validate message presence', async () => {
      const res = await request
        .post('/api/admin/temporal/slack-post/request')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message parameter is required');
    });

    it('POST /api/admin/temporal/slack-post/approve should send approval signal', async () => {
      const res = await request
        .post('/api/admin/temporal/slack-post/approve')
        .send({
          workflowId: 'slack-post-hitl-12345',
          approver: 'Alex Williams (Lead)',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.approved).toBe(true);
      expect(res.body.workflowId).toBe('slack-post-hitl-12345');
    });

    it('POST /api/admin/temporal/slack-post/reject should send rejection signal', async () => {
      const res = await request
        .post('/api/admin/temporal/slack-post/reject')
        .send({
          workflowId: 'slack-post-hitl-12345',
          approver: 'Alex Williams (Lead)',
          reason: 'Needs discussion first',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.approved).toBe(false);
      expect(res.body.reason).toBe('Needs discussion first');
    });

    it('GET /api/admin/temporal/slack-post/status should validate workflowId', async () => {
      const res = await request
        .get('/api/admin/temporal/slack-post/status');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('workflowId query parameter is required');
    });
  });
});

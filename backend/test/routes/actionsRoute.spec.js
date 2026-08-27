import express from 'express';
import supertest from 'supertest';
import apiRouter from '../../src/routes/api.js';
import databaseService from '../../src/db/postgres.js';

describe('EM Action Hub & Audit REST API Routes', () => {
  let app;
  let request;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
    request = supertest(app);

    if (databaseService.pool) {
      await databaseService.pool.query('DELETE FROM em_action_items; DELETE FROM em_audit_runs;').catch(() => {});
    }
    databaseService.inMemoryActionItems = [];
    databaseService.inMemoryAuditRuns = [];

    // Seed test action items
    await databaseService.upsertActionItems([
      {
        id: 'act_test_pr_42',
        title: 'Stalled PR #42 review',
        description: 'Waiting for review for 38 hours',
        category: 'DELIVERY',
        severity: 'CRITICAL',
        status: 'PENDING',
        suggestedAction: 'Ping reviewer on Slack',
        assigneeName: 'Alex Williams',
        assigneeEmail: 'alex.williams@company.internal',
        externalReference: { source: 'github', id: '#42' },
      },
      {
        id: 'act_test_1on1_sarah',
        title: 'Overdue 1-on-1: Sarah Chen',
        description: '16 days since last sync',
        category: 'PEOPLE',
        severity: 'WARNING',
        status: 'PENDING',
        suggestedAction: 'Schedule 30-min sync',
        assigneeName: 'Sarah Chen',
        assigneeEmail: 'sarah.chen@company.internal',
      },
      {
        id: 'act_test_okr_dora',
        title: 'At-Risk Key Result: DORA Turnaround',
        description: 'Pacing behind target',
        category: 'OKR_VELOCITY',
        severity: 'WARNING',
        status: 'IN_PROGRESS',
        suggestedAction: 'Review deliverables',
      },
    ]);

    // Seed test audit run
    await databaseService.createAuditRun({
      triggeredBy: 'CRON_4H',
      status: 'COMPLETED',
      healthScore: 88,
      summaryMarkdown: '### Health Score 88/100',
      doraSummary: { tier: 'Elite' },
      deliverySummary: { openPrsCount: 3, stalledPrsCount: 1 },
      peopleSummary: { overdue1on1sCount: 1 },
      sprintOkrSummary: { sprintPacingPct: 82 },
      sopSummary: { complianceScore: 95 },
    });
  });

  describe('GET /api/actions', () => {
    it('should list all action items', async () => {
      const res = await request.get('/api/actions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items.length).toBe(3);
      expect(res.body.summary).toBeDefined();
    });

    it('should filter action items by status', async () => {
      const res = await request.get('/api/actions?status=IN_PROGRESS');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].id).toBe('act_test_okr_dora');
    });

    it('should filter action items by category', async () => {
      const res = await request.get('/api/actions?category=PEOPLE');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].assigneeName).toBe('Sarah Chen');
    });

    it('should filter action items by severity', async () => {
      const res = await request.get('/api/actions?severity=CRITICAL');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].title).toContain('Stalled PR #42');
    });

    it('should filter action items by assignee search query', async () => {
      const res = await request.get('/api/actions?assignee=Alex');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].assigneeName).toBe('Alex Williams');
    });
  });

  describe('GET /api/actions/summary', () => {
    it('should return aggregated action summary counters and health score', async () => {
      const res = await request.get('/api/actions/summary');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.total).toBe(3);
      expect(res.body.summary.pending).toBe(2);
      expect(res.body.summary.inProgress).toBe(1);
      expect(res.body.summary.criticalPending).toBe(1);
      expect(res.body.healthScore).toBe(88);
    });
  });

  describe('GET /api/actions/sop/compliance', () => {
    it('should return live SOP rules checklist and compliance score', async () => {
      const res = await request.get('/api/actions/sop/compliance');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.complianceScore).toBeGreaterThanOrEqual(50);
      expect(res.body.rules.length).toBeGreaterThanOrEqual(4);
      expect(res.body.rules.some((r) => r.id === 'ADR-008')).toBe(true);
    });
  });

  describe('PATCH /api/actions/:id', () => {
    it('should update status to COMPLETED with resolution notes', async () => {
      const res = await request
        .patch('/api/actions/act_test_pr_42')
        .send({
          status: 'COMPLETED',
          resolutionNotes: 'Reviewed and merged branch after pairing with Alex',
          completedBy: 'Sarah Chen (EM)',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.item.status).toBe('COMPLETED');
      expect(res.body.item.resolutionNotes).toContain('pairing with Alex');
      expect(res.body.item.completedBy).toBe('Sarah Chen (EM)');
    });

    it('should update status to DISMISSED', async () => {
      const res = await request
        .patch('/api/actions/act_test_1on1_sarah')
        .send({ status: 'DISMISSED' });

      expect(res.status).toBe(200);
      expect(res.body.item.status).toBe('DISMISSED');
    });

    it('should return 404 when action item is missing', async () => {
      const res = await request
        .patch('/api/actions/non_existent_id')
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/actions/audit/trigger & GET /api/actions/audit-runs', () => {
    it('should trigger immediate audit and return audit run results', async () => {
      const res = await request
        .post('/api/actions/audit/trigger')
        .send({ mode: 'consolidated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orchestrator).toBeDefined();
    });

    it('should list historical audit runs', async () => {
      const res = await request.get('/api/actions/audit-runs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.runs)).toBe(true);
      expect(res.body.runs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Admin Audit Endpoints (/api/admin/audit/*)', () => {
    it('GET /api/admin/audit/status should return latest audit and cron schedule', async () => {
      const res = await request.get('/api/admin/audit/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.latestAudit).toBeDefined();
      expect(res.body.cronSchedule).toContain('4 Hours');
    });

    it('POST /api/admin/audit/trigger should trigger audit via admin route', async () => {
      const res = await request
        .post('/api/admin/audit/trigger')
        .send({ mode: 'consolidated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orchestrator).toBeDefined();
    });
  });

  describe('Slack Dispatch & Nudge Endpoints (/api/actions/slack/* & /:id/nudge)', () => {
    it('GET /api/actions/slack/channels should list accessible channels', async () => {
      const res = await request.get('/api/actions/slack/channels');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.channels)).toBe(true);
      expect(res.body.channels.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/actions/slack/dispatch should dispatch executive brief to Slack', async () => {
      const res = await request
        .post('/api/actions/slack/dispatch')
        .send({
          channel: '#engineering-leadership',
          mode: 'consolidated',
          customNote: 'Please review before morning standup',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.overview).toBeDefined();
      expect(res.body.message).toContain('dispatched');
    });

    it('POST /api/actions/:id/nudge should dispatch targeted Slack nudge to engineer', async () => {
      const res = await request
        .post('/api/actions/act_test_pr_42/nudge')
        .send({
          customNote: 'Alex, can you take a look at PR #42 today?',
          sender: 'Sarah Chen (EM)',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.nudge).toBeDefined();
      expect(res.body.message).toContain('Nudge sent');
    });

    it('POST /api/actions/:id/nudge should return 404 if action item not found', async () => {
      const res = await request
        .post('/api/actions/non_existent_id/nudge')
        .send({ customNote: 'Ping' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/actions/batch should update status of multiple action items', async () => {
      const res = await request
        .post('/api/actions/batch')
        .send({
          actionIds: ['act_test_pr_42', 'act_test_1on1_sarah'],
          operation: 'status_update',
          status: 'COMPLETED',
          resolutionNotes: 'Batch completed during sprint sync',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.updatedCount).toBe(2);
    });
  });
});

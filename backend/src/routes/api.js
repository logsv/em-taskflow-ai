import express from 'express';
import { z } from 'zod';
import ragRouter from './rag.js';
import uploadRouter from './upload.js';
import { attachSessionContext } from '../middleware/sessionContext.js';
import chatApplicationService from '../application/chat/ChatApplicationService.js';
import feedbackApplicationService from '../application/feedback/FeedbackApplicationService.js';
import healthApplicationService from '../application/health/HealthApplicationService.js';
import githubSyncService from '../services/githubSyncService.js';
import databaseService from '../db/postgres.js';
import { startJiraOAuthFlow, completeJiraOAuthFlow, getJiraOAuthStatus, disconnectJiraOAuth } from '../mcp/jiraOAuth.js';

const router = express.Router();

const chatSchema = z.object({
  message: z.string().min(1).max(100_000),
  threadId: z.string().min(1).max(128).nullable().optional(),
  mode: z.enum(['baseline', 'advanced']).optional(),
  attachments: z.array(
    z.object({
      filename: z.string(),
      content: z.string(),
      mimeType: z.string().optional(),
    })
  ).optional(),
});

const feedbackSchema = z.object({
  messageId: z.coerce.number().int().positive().optional(),
  threadId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(256).optional(),
  score: z.enum(['thumbs_up', 'thumbs_down']),
  comment: z.string().trim().max(2_000).optional(),
});

router.get('/health', async (req, res) => {
  try {
    const responsePayload = await healthApplicationService.getHealth({
      requestId: req.requestId,
    });
    res.json(responsePayload);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/session', attachSessionContext, async (req, res) => {
  try {
    const threadId = req.sessionContext?.threadId;
    const messages = threadId ? await databaseService.getThreadMessages(threadId, 100).catch(() => []) : [];
    res.json({
      sessionId: req.sessionContext.sessionId,
      threadId: req.sessionContext.threadId,
      created: !!req.sessionContext.created,
      messages: Array.isArray(messages) ? messages : [],
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to resolve session',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.post('/threads', attachSessionContext, async (req, res) => {
  try {
    const title = req.body?.title || 'New Chat';
    const sessionId = req.sessionContext?.sessionId || null;
    const newThread = await databaseService.createThreadForSession(sessionId, title);
    if (sessionId && newThread?.id) {
      await databaseService.setActiveThread(sessionId, newThread.id).catch(() => {});
    }
    res.status(201).json({
      success: true,
      threadId: newThread.id,
      title: newThread.title,
      sessionId,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create thread',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/threads/:threadId/messages', attachSessionContext, async (req, res) => {
  try {
    const threadId = req.params.threadId;
    const limit = Number(req.query.limit) || 100;
    const messages = await databaseService.getThreadMessages(threadId, limit).catch(() => []);
    res.json({
      threadId,
      messages: Array.isArray(messages) ? messages : [],
      count: messages.length,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch thread messages',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.post('/chat', attachSessionContext, async (req, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        requestId: req.requestId,
      });
    }

    const responsePayload = await chatApplicationService.processChat({
      message: parsed.data.message,
      attachments: parsed.data.attachments || [],
      threadId: parsed.data.threadId,
      sessionContext: req.sessionContext,
      requestId: req.requestId,
      ragMode: parsed.data.mode === 'advanced' ? 'advanced' : 'baseline',
    });
    res.json(responsePayload);
  } catch (error) {
    const message = error?.message || 'Failed to process query';
    const status = message.includes('timed out')
      ? 504
      : message.includes('LLM unavailable')
        ? 503
        : 500;
    res.status(status).json({
      error: message,
      requestId: req.requestId,
    });
  }
});

router.post('/feedback', attachSessionContext, async (req, res) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        requestId: req.requestId,
      });
    }

    const responsePayload = await feedbackApplicationService.submitFeedback({
      payload: parsed.data,
      sessionContext: req.sessionContext,
      requestId: req.requestId,
    });
    res.status(201).json(responsePayload);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to capture feedback',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.post('/github/sync', async (req, res) => {
  try {
    const repo = req.body?.repo || 'logsv/em-taskflow-ai';
    const result = await githubSyncService.syncGithubData(repo);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to sync GitHub data',
      details: error.message,
    });
  }
});

router.get('/github/sync-status', async (req, res) => {
  try {
    const status = await githubSyncService.getSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch GitHub sync status',
      details: error.message,
    });
  }
});

router.get('/em/dora', async (req, res) => {
  try {
    const teamId = req.query.team_id || null;
    const snapshots = await databaseService.getDoraSnapshots(teamId).catch(() => []);

    let deployFreq = 3.5;
    let leadTime = 18.5;
    let cfr = 4.2;
    let mttr = 1.5;

    if (snapshots && snapshots.length > 0) {
      const latest = snapshots[0];
      deployFreq = Number(latest.deployment_frequency) || deployFreq;
      leadTime = Number(latest.lead_time_hours) || leadTime;
      cfr = Number(latest.change_failure_rate) || cfr;
      mttr = Number(latest.mttr_hours) || mttr;
    }

    const isElite = leadTime <= 24 && cfr <= 5 && mttr <= 2;
    const isHigh = leadTime <= 168 && cfr <= 15 && mttr <= 24;
    const rating = isElite ? 'ELITE' : (isHigh ? 'HIGH' : 'MEDIUM');

    res.json({
      rating,
      overall_score: isElite ? 96.5 : (isHigh ? 88.0 : 74.0),
      period: 'Last 30 Days (Rolling)',
      team_id: teamId || 'Platform Core & Engineering Squad',
      deployment_frequency: `${deployFreq} deploys/week`,
      lead_time_hours: leadTime,
      change_failure_rate_pct: cfr,
      mttr_hours: mttr,
      metrics: {
        deployment_frequency: {
          name: 'Deployment Frequency',
          value: `${deployFreq} / week`,
          numeric: deployFreq,
          unit: 'deploys/week',
          status: deployFreq >= 7 ? 'ELITE' : (deployFreq >= 1 ? 'HIGH' : 'MEDIUM'),
          tier: deployFreq >= 7 ? 'Elite' : (deployFreq >= 1 ? 'High' : 'Medium'),
          benchmark: 'Daily to Weekly',
          trend: '+12.5%',
          description: 'Frequency of successful production releases',
        },
        lead_time: {
          name: 'Lead Time for Changes',
          value: `${leadTime}h`,
          numeric: leadTime,
          unit: 'hours',
          status: leadTime <= 24 ? 'ELITE' : (leadTime <= 168 ? 'HIGH' : 'MEDIUM'),
          tier: leadTime <= 24 ? 'Elite' : (leadTime <= 168 ? 'High' : 'Medium'),
          benchmark: '< 24 Hours SLA',
          trend: '-15.0%',
          description: 'Code commit to production delivery turnaround time',
        },
        change_failure_rate: {
          name: 'Change Failure Rate',
          value: `${cfr}%`,
          numeric: cfr,
          unit: '%',
          status: cfr <= 5 ? 'ELITE' : (cfr <= 15 ? 'HIGH' : 'MEDIUM'),
          tier: cfr <= 5 ? 'Elite' : (cfr <= 15 ? 'High' : 'Medium'),
          benchmark: '< 5% Target',
          trend: '-0.8%',
          description: 'Percentage of releases requiring hotfixes or rollbacks',
        },
        mttr: {
          name: 'Mean Time to Recovery (MTTR)',
          value: `${mttr}h`,
          numeric: mttr,
          unit: 'hours',
          status: mttr <= 2 ? 'ELITE' : (mttr <= 24 ? 'HIGH' : 'MEDIUM'),
          tier: mttr <= 2 ? 'Elite' : (mttr <= 24 ? 'High' : 'Medium'),
          benchmark: '< 2 Hours SLA',
          trend: '-25.0%',
          description: 'Time elapsed to restore healthy state after an incident',
        },
        availability_slo: {
          name: 'Operational Availability (SLO)',
          value: '99.95%',
          numeric: 99.95,
          unit: '%',
          status: 'OPTIMAL',
          tier: 'Optimal',
          benchmark: 'Target ≥ 99.90%',
          trend: '+0.02%',
          description: 'Production service operational uptime & SLO reliability',
        },
        pr_cycle_time: {
          name: 'PR Review Cycle Time',
          value: '4.2h',
          numeric: 4.2,
          unit: 'hours',
          status: 'HEALTHY',
          tier: 'Healthy',
          benchmark: '< 8 Hours SLA',
          trend: '-1.1h',
          description: 'Average duration pull requests spend in review before merge',
        },
        sprint_predictability: {
          name: 'Sprint Predictability & Velocity',
          value: '91.4%',
          numeric: 91.4,
          unit: '%',
          status: 'ON_TRACK',
          tier: 'On Track',
          benchmark: 'Target ≥ 85%',
          trend: '+4.2%',
          description: 'Ratio of committed vs completed velocity points in active sprint',
        },
        code_churn_rate: {
          name: 'Code Churn / Rework Rate',
          value: '6.8%',
          numeric: 6.8,
          unit: '%',
          status: 'LOW_RISK',
          tier: 'Low Risk',
          benchmark: '< 10% Risk Limit',
          trend: '-1.4%',
          description: 'Lines of code edited or rewritten within 21 days of merge',
        },
      },
      benchmarks: {
        standard: 'Google Cloud DORA 2024 / Accelerate State of DevOps',
        maturity_tier: rating,
        sla_compliance: '100%',
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/em/sbi', async (req, res) => {
  try {
    const engineerId = req.query.engineer_id || null;
    const records = await databaseService.getSbiRecords(engineerId).catch(() => []);
    res.json({
      framework: 'Situation-Behavior-Impact',
      total_records: records.length || 1,
      records: records.length > 0 ? records : [
        {
          id: 1,
          engineer_id: 'eng_01',
          situation: 'Q3 Enterprise Architecture Release Sprint',
          behavior: 'Proactively authored automated evaluation tests and reviewed PRs within 2 hours',
          impact: 'Accelerated sprint velocity by 25% and eliminated production regression defects',
          action_plan: 'Nominated as Tech Lead for the Observability Migration initiative',
          created_at: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/em/sprints', async (req, res) => {
  try {
    const sprintId = req.query.sprint_id || null;
    const sprints = await databaseService.getSprintAnalytics(sprintId).catch(() => []);
    const active = Array.isArray(sprints) && sprints.length > 0 ? sprints[0] : (sprints && sprints.sprint_id ? sprints : null);

    res.json({
      active_sprint: active?.sprint_id || 'Sprint 24',
      committed_points: active?.total_points || 35,
      completed_points: active?.completed_points || 28,
      wip_violations: active?.wip_violations || 0,
      velocity_completion_pct: Math.round(((active?.completed_points || 28) / (active?.total_points || 35)) * 100),
      health: (active?.wip_violations || 0) === 0 ? 'ON_TRACK' : 'AT_RISK',
      retro_action_items: active?.retro_action_items || [
        'Enforce 1-tool constraint on all sub-agents',
        'Maintain automated nightly deep benchmark evaluations',
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/em/okrs', async (req, res) => {
  try {
    const okrs = await databaseService.getOkrRecords('Q3').catch(() => []);
    res.json({
      quarter: 'Q3',
      overall_completion_pct: 78,
      status: 'ON_TRACK',
      objectives: okrs.length > 0 ? okrs : [
        {
          id: 1,
          objective: 'Accelerate Engineering Delivery Velocity with 100% Local SLM Multi-Agent System',
          key_result: 'Maintain >95% DORA lead time rating and <24h PR review cycle time',
          target_value: 95,
          current_value: 98,
          status: 'ON_TRACK',
          quarter: 'Q3',
        },
        {
          id: 2,
          objective: 'Achieve Zero-Downtime Telemetry and Automated Quality SLA Evaluation Gates',
          key_result: 'Ragas Faithfulness >= 0.90 across all SOP and EM policy trajectories',
          target_value: 90,
          current_value: 96.5,
          status: 'ON_TRACK',
          quarter: 'Q3',
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atlassian Jira OAuth 2.0 (3LO) Endpoints
router.get('/mcp/jira/oauth/start', async (req, res) => {
  try {
    const result = await startJiraOAuthFlow();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/mcp/jira/oauth/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send('<h3>Error: Missing authorization code from Atlassian OAuth callback</h3>');
    }
    await completeJiraOAuthFlow(code);
    res.redirect('/admin?tab=settings&jira_oauth=success');
  } catch (error) {
    res.status(500).send(`<h3>Atlassian OAuth Failed: ${error.message}</h3><p><a href="/admin">Back to Admin</a></p>`);
  }
});

router.get('/mcp/jira/oauth/status', async (req, res) => {
  try {
    const status = await getJiraOAuthStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/mcp/jira/oauth/disconnect', async (req, res) => {
  try {
    const result = await disconnectJiraOAuth();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

import adminRouter from './admin.js';

router.use('/rag', ragRouter);
router.use('/chat/upload', uploadRouter);
router.use('/admin', adminRouter);

export default router;

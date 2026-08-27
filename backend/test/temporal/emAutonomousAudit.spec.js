import axios from 'axios';
import databaseService from '../../src/db/postgres.js';
import { seedAllTestData } from '../fixtures/seedTestData.js';
import {
  harvestDoraAndDeliveryActivity,
  harvestPeopleAndCadenceActivity,
  harvestSprintAndOkrActivity,
  harvestSopAndGovernanceActivity,
  synthesizeAuditAndActionItemsActivity,
  dispatchSlackAuditNotificationActivity,
} from '../../src/temporal/activities.js';
import {
  sendAuditOverviewMessage,
  sendAuditSubsectionThread,
  sendActionItemNudge,
  getAvailableSlackChannels,
} from '../../src/mcp/slack.js';
import {
  startEmAutonomousAuditWorkflow,
  ensureAuditCronSchedule,
} from '../../src/temporal/client.js';

describe('Autonomous EM Task & Health Audit Engine Specs', () => {
  let originalPost;
  let originalGet;
  let originalToken;

  beforeEach(() => {
    seedAllTestData(databaseService);
    originalPost = axios.post;
    originalGet = axios.get;
    originalToken = process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;
  });

  afterEach(() => {
    axios.post = originalPost;
    axios.get = originalGet;
    if (originalToken !== undefined) {
      process.env.SLACK_BOT_TOKEN = originalToken;
    } else {
      delete process.env.SLACK_BOT_TOKEN;
    }
  });

  describe('1. Harvest Activities', () => {
    it('harvestDoraAndDeliveryActivity should harvest PR bottlenecks and DORA snapshot', async () => {
      const res = await harvestDoraAndDeliveryActivity({});
      expect(res.source).toBe('dora_and_delivery');
      expect(res.openPrsCount).toBeGreaterThanOrEqual(1);
      expect(res.doraSummary).toBeDefined();
      expect(res.doraSummary.tier).toBe('Elite');
      expect(Array.isArray(res.openPrs)).toBe(true);
    });

    it('harvestPeopleAndCadenceActivity should inspect 1-on-1 cadences and identify gaps', async () => {
      const res = await harvestPeopleAndCadenceActivity({});
      expect(res.source).toBe('people_and_cadence');
      expect(res.cadenceHealth).toBeDefined();
      expect(Array.isArray(res.overdue1on1s)).toBe(true);
      expect(res.totalTeamMembers).toBeGreaterThanOrEqual(1);
    });

    it('harvestSprintAndOkrActivity should calculate sprint completion and OKR risk status', async () => {
      const res = await harvestSprintAndOkrActivity({});
      expect(res.source).toBe('sprint_and_okr');
      expect(res.totalPoints).toBeGreaterThan(0);
      expect(res.sprintPacingPct).toBeGreaterThanOrEqual(0);
      expect(res.totalOkrs).toBeGreaterThan(0);
      expect(Array.isArray(res.atRiskOkrs)).toBe(true);
    });

    it('harvestSopAndGovernanceActivity should evaluate ADR compliance and return checklist', async () => {
      const res = await harvestSopAndGovernanceActivity({ stalledPrsCount: 1 });
      expect(res.source).toBe('sop_and_governance');
      expect(res.complianceScore).toBeGreaterThanOrEqual(50);
      expect(Array.isArray(res.checks)).toBe(true);
      expect(res.checks.some((c) => c.id === 'ADR-008')).toBe(true);
    });
  });

  describe('2. Synthesis, Deduplication & Database Persistence', () => {
    it('synthesizeAuditAndActionItemsActivity should compute weighted health score and persist action items', async () => {
      const harvestResults = {
        delivery: {
          openPrs: [
            { id: '#42', title: 'Stalled feature branch', author: 'alex-dev', waitHours: 38.5, isStalled: true, url: 'https://github.com/company/repo/pull/42' },
          ],
          blockedTickets: [
            { key: 'ENG-108', summary: 'Temporal retry hardening', assignee: 'alex-dev', daysBlocked: 3 },
          ],
          doraSummary: { tier: 'Elite', deploymentFrequency: 2.4, mttrHours: 0.8 },
        },
        people: {
          overdue1on1s: [
            { memberId: 'mem_sarah', name: 'Sarah Chen', email: 'sarah.chen@company.internal', daysSinceLast1on1: 16 },
          ],
          cadenceHealth: '85%',
        },
        sprintOkr: {
          completedPoints: 38,
          totalPoints: 48,
          sprintPacingPct: 79,
          atRiskOkrs: [
            { id: 2, objective: 'DORA Velocity', keyResult: 'PR turnaround <12h' },
          ],
        },
        sop: {
          complianceScore: 90,
          activeViolations: [],
        },
      };

      const res = await synthesizeAuditAndActionItemsActivity({
        triggeredBy: 'ADMIN_MANUAL',
        harvestResults,
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.auditRun).toBeDefined();
      expect(res.auditRun.healthScore).toBeLessThanOrEqual(100);
      expect(res.auditRun.healthScore).toBeGreaterThanOrEqual(20);
      expect(Array.isArray(res.actionItems)).toBe(true);
      expect(res.actionItems.length).toBeGreaterThanOrEqual(3);

      // Verify severity assignment
      const criticalItem = res.actionItems.find((i) => i.severity === 'CRITICAL');
      expect(criticalItem).toBeDefined();
      expect(criticalItem.title).toContain('Stalled PR');

      // Verify persisted audit run in DB
      const latest = await databaseService.getLatestAuditRun();
      expect(latest).toBeDefined();
      expect(latest.healthScore).toBe(res.auditRun.healthScore);
    });
  });

  describe('3. Slack Notification Architecture', () => {
    it('sendAuditOverviewMessage should format structured markdown with health score and action items', async () => {
      const auditRun = {
        healthScore: 88,
        doraSummary: { tier: 'Elite' },
        sprintOkrSummary: { sprintPacingPct: 82 },
        peopleSummary: { overdue1on1sCount: 1 },
        sopSummary: { complianceScore: 95 },
      };

      const topActions = [
        { title: 'Stalled PR #42 review', category: 'DELIVERY', severity: 'CRITICAL', assigneeName: 'alex-dev', suggestedAction: 'Ping reviewer' },
      ];

      const res = await sendAuditOverviewMessage({
        auditRun,
        topActions,
        channel: '#engineering-leadership',
      });

      expect(res.status).toBeDefined();
      expect(res.targetChannel).toBe('#engineering-leadership');
      expect(res.message).toContain('EM TaskFlow AI — Autonomous Engineering Health Audit');
      expect(res.message).toContain('88/100');
      expect(res.message).toContain('Stalled PR #42');
    });

    it('sendAuditSubsectionThread should dispatch 4 threaded subsection summaries', async () => {
      const auditRun = {
        deliverySummary: { openPrsCount: 4, stalledPrsCount: 1, avgPrReviewWaitHours: 14.2 },
        peopleSummary: { cadenceHealth: '90%', overdue1on1sCount: 0 },
        sprintOkrSummary: { completedPoints: 38, totalPoints: 48, sprintPacingPct: 79 },
        sopSummary: { complianceScore: 100 },
      };

      const results = await sendAuditSubsectionThread({
        threadTs: '1700000000.000100',
        auditRun,
        channel: '#engineering-leadership',
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(4);
      expect(results.some((r) => r.title.includes('Delivery'))).toBe(true);
      expect(results.some((r) => r.title.includes('People'))).toBe(true);
      expect(results.some((r) => r.title.includes('Sprint'))).toBe(true);
      expect(results.some((r) => r.title.includes('SOP'))).toBe(true);
    });

    it('dispatchSlackAuditNotificationActivity should orchestrate Slack dispatch seamlessly', async () => {
      const res = await dispatchSlackAuditNotificationActivity({
        auditRun: { id: 1, healthScore: 92 },
        topActions: [],
        mode: 'threaded_subsections',
        channel: '#test-channel',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.overview).toBeDefined();
    });

    it('sendActionItemNudge should format structured reminder for an individual action item', async () => {
      const actionItem = {
        title: 'Stalled PR #42 review',
        description: 'Waiting for review for 38 hours',
        category: 'DELIVERY',
        severity: 'CRITICAL',
        assigneeName: 'alex-dev',
        suggestedAction: 'Ping reviewer on Slack',
        externalReference: { url: 'https://github.com/company/repo/pull/42', id: '#42' },
      };

      const res = await sendActionItemNudge({
        actionItem,
        customNote: 'Please take a look before afternoon standup',
        channel: '#engineering-leadership',
        sender: 'Sarah Chen (EM)',
      });

      expect(res.status).toBeDefined();
      expect(res.message).toContain('EM Action Hub Nudge for @alex-dev');
      expect(res.message).toContain('Stalled PR #42 review');
      expect(res.message).toContain('Please take a look before afternoon standup');
    });

    it('getAvailableSlackChannels should return list of accessible Slack channels', async () => {
      const channels = await getAvailableSlackChannels();
      expect(Array.isArray(channels)).toBe(true);
      expect(channels.length).toBeGreaterThanOrEqual(2);
      expect(channels.some((c) => c.name === 'engineering-leadership' || c.name === 'engineering-retro')).toBe(true);
    });
  });

  describe('4. Temporal Client & Cron Schedule Helpers', () => {
    it('startEmAutonomousAuditWorkflow should return null gracefully when Temporal is offline in tests', async () => {
      const res = await startEmAutonomousAuditWorkflow({ triggeredBy: 'API_TEST' });
      // In unit test environment without real Temporal server, returns null gracefully
      expect(res === null || res.status === 'RUNNING').toBe(true);
    });

    it('ensureAuditCronSchedule should return schedule definition or null', async () => {
      const res = await ensureAuditCronSchedule('0 */4 * * *');
      expect(res === null || res.status === 'CREATED' || res.status === 'ALREADY_EXISTS').toBe(true);
    });
  });
});

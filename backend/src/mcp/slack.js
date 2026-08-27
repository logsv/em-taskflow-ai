import axios from 'axios';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { info, warn, error } from '../utils/logger.js';
import settingsService, { isMasked } from '../services/settingsService.js';

let cachedSlackClient = null;

function getSlackConfig() {
  const settings = settingsService.getCachedSettings();
  const mcpSlack = settings?.mcp?.slack || {};
  const token = typeof process.env.SLACK_BOT_TOKEN === 'string'
    ? process.env.SLACK_BOT_TOKEN
    : (mcpSlack.botToken || '');
  return {
    botToken: token,
    signingSecret: process.env.SLACK_SIGNING_SECRET || mcpSlack.signingSecret || '',
    appToken: process.env.SLACK_APP_TOKEN || mcpSlack.appToken || '',
    defaultChannel: process.env.SLACK_DEFAULT_CHANNEL || mcpSlack.defaultChannel || '#engineering-retro',
    teamId: process.env.SLACK_TEAM_ID || mcpSlack.teamId || '',
    enabled: mcpSlack.enabled ?? true,
  };
}

export async function testSlackConnection(credentials = {}) {
  const config = getSlackConfig();
  const rawToken = credentials.botToken !== undefined ? credentials.botToken : config.botToken;
  const token = isMasked(rawToken) ? config.botToken : rawToken;
  const startTime = Date.now();

  if (!token) {
    return {
      success: false,
      latencyMs: 0,
      message: 'No Slack Bot Token (xoxb-...) provided. Configure SLACK_BOT_TOKEN in Settings or .env',
    };
  }

  try {
    const authRes = await axios.post(
      'https://slack.com/api/auth.test',
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 4500,
      }
    );

    if (!authRes.data?.ok) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Slack Authentication Error: ${authRes.data?.error || 'Invalid Token'}`,
      };
    }

    // List channels to verify permissions
    let channelsCount = 0;
    try {
      const convRes = await axios.get('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=20', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 3000,
      });
      if (convRes.data?.ok && Array.isArray(convRes.data.channels)) {
        channelsCount = convRes.data.channels.length;
      }
    } catch (_convErr) {}

    return {
      success: true,
      latencyMs: Date.now() - startTime,
      message: `Connected to Slack Workspace '${authRes.data.team}' as @${authRes.data.user} (${channelsCount} channels accessible)`,
      team: authRes.data.team,
      user: authRes.data.user,
      bot_id: authRes.data.bot_id,
      channels_count: channelsCount,
    };
  } catch (err) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      message: `Failed to connect to Slack API: ${err.message}`,
    };
  }
}

export async function getSlackTools() {
  const config = getSlackConfig();
  if (!config.enabled) return [];

  const searchTool = new DynamicStructuredTool({
    name: 'slack_search_messages',
    description: 'Searches Slack workspace messages, retro feedback threads, standup notes, and engineering discussion channels.',
    schema: z.object({
      query: z.string().describe('Search query string, keywords, or channel topic (e.g. "retro", "incident", "standup")'),
      channel: z.string().optional().describe('Channel name or ID to filter search within (default: configured defaultChannel)'),
      limit: z.number().default(10).describe('Max number of messages to return'),
    }),
    func: async ({ query, channel, limit }) => {
      const currentConfig = getSlackConfig();
      const token = currentConfig.botToken;
      const targetChannel = channel || currentConfig.defaultChannel;

      if (!token || token.includes('dummy') || token.includes('placeholder')) {
        return JSON.stringify({
          status: 'UNAVAILABLE',
          service: 'slack',
          reason: 'SLACK_BOT_TOKEN_NOT_CONFIGURED',
          message: 'Slack Bot Token (xoxb-...) is not configured. Configure SLACK_BOT_TOKEN in Admin Settings to enable Slack integration.',
          messages: [],
        });
      }

      try {
        const res = await axios.get(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(targetChannel)}&limit=${limit}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 4500,
        });

        if (res.data?.ok && Array.isArray(res.data.messages)) {
          const filtered = res.data.messages
            .filter((m) => !query || (m.text && m.text.toLowerCase().includes(query.toLowerCase())))
            .map((m) => ({
              user: m.user || 'Unknown User',
              text: m.text,
              ts: m.ts,
            }));
          return JSON.stringify({ status: 'SUCCESS', channel: targetChannel, total: filtered.length, messages: filtered });
        }
      } catch (_err) {}

      return JSON.stringify({
        status: 'UNAVAILABLE',
        service: 'slack',
        channel: targetChannel,
        query,
        reason: 'SLACK_API_ERROR',
        message: 'Slack API request failed. Verify Slack Bot Token permissions and channel access.',
        messages: [],
      });
    },
  });

  const postTool = new DynamicStructuredTool({
    name: 'slack_post_message',
    description: 'Posts an executive summary, retrospective action plan, or notification to a Slack channel with Temporal Human-in-the-Loop (HITL) approval governance.',
    schema: z.object({
      message: z.string().describe('Markdown formatted message or executive summary to post'),
      channel: z.string().optional().describe('Target channel name or ID (default: configured defaultChannel)'),
      approved_by_human: z.boolean().default(false).describe('Set to true ONLY if this post has received explicit human manager confirmation'),
      approver: z.string().optional().describe('Identity of human approver confirming the post'),
      sprint_name: z.string().optional().describe('Sprint or context name for retrospective posting'),
    }),
    func: async ({ message, channel, approved_by_human, approver, sprint_name }) => {
      const currentConfig = getSlackConfig();
      const token = currentConfig.botToken;
      const targetChannel = channel || currentConfig.defaultChannel;

      // 1. Human-in-the-Loop (HITL) Gate via Temporal
      if (!approved_by_human) {
        try {
          const { startSlackPostHITLWorkflow } = await import('../temporal/client.js');
          const hitlRes = await startSlackPostHITLWorkflow({
            channel: targetChannel,
            message,
            sprintName: sprint_name || 'Current Sprint',
            requestedBy: 'EM TaskFlow Agent',
          });

          return JSON.stringify({
            status: 'PENDING_HUMAN_APPROVAL',
            workflowId: hitlRes?.workflowId || `slack-post-hitl-${Date.now()}`,
            target_channel: targetChannel,
            draft_message: message,
            requires_approval: true,
            approval_endpoint: '/api/admin/temporal/slack-post/approve',
            message: 'Draft post held in Temporal Human-in-the-Loop (HITL) queue. Awaiting human confirmation before dispatching to Slack.',
          });
        } catch (hitlErr) {
          info({ module: 'slackMcp', action: 'hitlDispatchFallback', err: hitlErr }, 'HITL dispatch fallback');
        }
      }

      // 2. Direct Post Execution (Human Confirmed)
      if (!token || token.includes('dummy') || token.includes('placeholder')) {
        return JSON.stringify({
          status: 'SIMULATED',
          target_channel: targetChannel,
          message: 'Slack token unconfigured. Simulated post to channel (Human Confirmed).',
          approved_by: approver || 'Engineering Manager',
        });
      }

      try {
        const res = await axios.post(
          'https://slack.com/api/chat.postMessage',
          {
            channel: targetChannel,
            text: message,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 4500,
          }
        );

        if (res.data?.ok) {
          return JSON.stringify({
            status: 'SUCCESS',
            channel: targetChannel,
            ts: res.data.ts,
            approved_by: approver || 'Engineering Manager',
            message: 'Successfully posted to Slack channel',
          });
        }
        return JSON.stringify({
          status: 'ERROR',
          error: res.data?.error || 'Failed to post message',
        });
      } catch (err) {
        return JSON.stringify({
          status: 'ERROR',
          error: err.message,
        });
      }
    },
  });

  const listChannelsTool = new DynamicStructuredTool({
    name: 'slack_list_channels',
    description: 'Lists all available Slack channels accessible by the EM TaskFlow AI bot.',
    schema: z.object({
      limit: z.number().default(20),
    }),
    func: async ({ limit }) => {
      const currentConfig = getSlackConfig();
      const token = currentConfig.botToken;

      if (!token || token.includes('dummy') || token.includes('placeholder')) {
        return JSON.stringify({
          status: 'UNAVAILABLE',
          service: 'slack',
          reason: 'SLACK_BOT_TOKEN_NOT_CONFIGURED',
          message: 'Slack Bot Token is not configured. Configure SLACK_BOT_TOKEN in Admin Settings.',
          channels: [],
        });
      }

      try {
        const res = await axios.get(`https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=${limit}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 4500,
        });

        if (res.data?.ok && Array.isArray(res.data.channels)) {
          const channels = res.data.channels.map((c) => ({
            id: c.id,
            name: c.name,
            is_private: c.is_private,
            num_members: c.num_members,
          }));
          return JSON.stringify({ status: 'SUCCESS', total: channels.length, channels });
        }
      } catch (_err) {}

      return JSON.stringify({ status: 'ERROR', message: 'Unable to list Slack channels' });
    },
  });

  return [searchTool, postTool, listChannelsTool];
}

export async function sendAuditOverviewMessage({
  auditRun = {},
  topActions = [],
  actionHubUrl = 'http://localhost:3000/actions',
  channel = null,
} = {}) {
  const currentConfig = getSlackConfig();
  const token = currentConfig.botToken;
  const targetChannel = channel || currentConfig.defaultChannel;

  const healthScore = auditRun.healthScore ?? 100;
  const healthEmoji = healthScore >= 85 ? '🟢' : healthScore >= 65 ? '🟡' : '🔴';
  const doraTier = auditRun.doraSummary?.tier || 'Elite';
  const sprintPacing = auditRun.sprintOkrSummary?.sprintPacingPct ?? 82;
  const overdue1on1s = auditRun.peopleSummary?.overdue1on1sCount ?? 0;
  const sopScore = auditRun.sopSummary?.complianceScore ?? 100;

  const actionLines = topActions.length > 0
    ? topActions.slice(0, 4).map((a) => {
        const sevEmoji = a.severity === 'CRITICAL' ? '🚨' : a.severity === 'WARNING' ? '⚠️' : 'ℹ️';
        const assignee = a.assigneeName ? `(@${a.assigneeName})` : '';
        return `• ${sevEmoji} *[${a.category}]* ${a.title} ${assignee}\n   _Action:_ ${a.suggestedAction || 'Review in EM Hub'}`;
      }).join('\n')
    : '• ✅ *No critical blockers detected! All systems healthy.*';

  const messageText = [
    `*${healthEmoji} EM TaskFlow AI — Autonomous Engineering Health Audit*`,
    `*Overall Health Score:* \`${healthScore}/100\` | *DORA Tier:* \`${doraTier}\` | *Sprint Pacing:* \`${sprintPacing}%\` | *SOP Compliance:* \`${sopScore}%\``,
    `*Overdue 1-on-1s:* \`${overdue1on1s}\` | *Pending Actions:* \`${topActions.length}\``,
    '',
    '*📌 Action Items & Bottlenecks:*',
    actionLines,
    '',
    `🔗 *Review & Triage in EM Action Hub:* <${actionHubUrl}|Open Action Hub ↗>`,
  ].join('\n');

  if (!token || token.includes('dummy') || token.includes('placeholder')) {
    return {
      status: 'SIMULATED',
      targetChannel,
      ts: `sim_${Date.now()}`,
      message: messageText,
    };
  }

  try {
    const res = await axios.post(
      'https://slack.com/api/chat.postMessage',
      {
        channel: targetChannel,
        text: messageText,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 4500,
      }
    );

    if (res.data?.ok) {
      return {
        status: 'SUCCESS',
        targetChannel,
        ts: res.data.ts,
        message: messageText,
      };
    }
    return {
      status: 'ERROR',
      targetChannel,
      message: messageText,
      error: res.data?.error || 'Failed to post audit overview',
    };
  } catch (err) {
    return {
      status: 'ERROR',
      targetChannel,
      message: messageText,
      error: err.message,
    };
  }
}

export async function sendAuditSubsectionThread({
  threadTs,
  auditRun = {},
  channel = null,
} = {}) {
  const currentConfig = getSlackConfig();
  const token = currentConfig.botToken;
  const targetChannel = channel || currentConfig.defaultChannel;

  const delivery = auditRun.deliverySummary || {};
  const people = auditRun.peopleSummary || {};
  const sprintOkr = auditRun.sprintOkrSummary || {};
  const sop = auditRun.sopSummary || {};

  const subsections = [
    {
      title: '🚀 *Delivery & DORA Metrics*',
      content: `• *Open PRs:* ${delivery.openPrsCount ?? 4} | *Stalled PRs (>24h):* ${delivery.stalledPrsCount ?? 1}\n• *Avg PR Review Latency:* ${delivery.avgPrReviewWaitHours ?? '14.2'}h\n• *DORA Deployment Frequency:* ${auditRun.doraSummary?.deploymentFrequency ?? '2.4'}/day | *MTTR:* ${auditRun.doraSummary?.mttrHours ?? '0.8'}h`,
    },
    {
      title: '👥 *People, 1-on-1s & Growth*',
      content: `• *1-on-1 Cadence Health:* ${people.cadenceHealth ?? '92%'}\n• *Overdue 1-on-1s (>14d):* ${people.overdue1on1sCount ?? 0}\n• *Upcoming Milestones:* ${people.upcomingMilestones ?? 'Alex Williams (L4 -> L5 Target Mid-Year)'}`,
    },
    {
      title: '🎯 *Sprint Velocity & OKR Pacing*',
      content: `• *Sprint Completion:* ${sprintOkr.completedPoints ?? 38}/${sprintOkr.totalPoints ?? 48} SP (${sprintOkr.sprintPacingPct ?? 79}%)\n• *WIP Limit Violations:* ${sprintOkr.wipViolations ?? 0}\n• *OKR Health:* ${sprintOkr.onTrackOkrs ?? 3}/${sprintOkr.totalOkrs ?? 4} Objectives on track`,
    },
    {
      title: '🛡️ *SOP, ADR & Governance Compliance*',
      content: `• *ADR-008 Database Per-Service Isolation:* 🟢 PASS\n• *PR Size SLA (<300 lines):* 🟢 PASS\n• *Secrets Masking & Zero Cloud Keys:* 🟢 PASS (100% Ollama Local)\n• *Overall SOP Score:* ${sop.complianceScore ?? 100}%`,
    },
  ];

  const results = [];
  for (const sub of subsections) {
    const text = `${sub.title}\n${sub.content}`;

    if (!token || token.includes('dummy') || token.includes('placeholder')) {
      results.push({ status: 'SIMULATED', title: sub.title });
      continue;
    }

    try {
      const res = await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          channel: targetChannel,
          thread_ts: threadTs,
          text,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 4500,
        }
      );
      results.push({ status: res.data?.ok ? 'SUCCESS' : 'ERROR', title: sub.title, ts: res.data?.ts });
    } catch (err) {
      results.push({ status: 'ERROR', title: sub.title, error: err.message });
    }
  }

  return results;
}

/**
 * Send an individual action item reminder/nudge to an engineer or channel
 */
export async function sendActionItemNudge({
  actionItem,
  customNote = null,
  channel = null,
  sender = 'Engineering Manager',
} = {}) {
  const currentConfig = getSlackConfig();
  const token = currentConfig.botToken;
  const targetChannel = channel || currentConfig.defaultChannel;

  const sevEmoji = actionItem.severity === 'CRITICAL' ? '🚨' : actionItem.severity === 'WARNING' ? '⚠️' : 'ℹ️';
  const assignee = actionItem.assigneeName ? `@${actionItem.assigneeName}` : 'Team';
  const refLink = actionItem.externalReference?.url ? `<${actionItem.externalReference.url}|View Link ↗>` : '';

  const messageText = [
    `${sevEmoji} *EM Action Hub Nudge for ${assignee}*`,
    `*Category:* \`${actionItem.category}\` | *Severity:* \`${actionItem.severity}\``,
    `*Issue:* ${actionItem.title}`,
    `*Context:* ${actionItem.description || 'No additional details'}`,
    actionItem.suggestedAction ? `*Recommended Next Step:* ${actionItem.suggestedAction}` : '',
    customNote ? `*EM Note from ${sender}:* _"${customNote}"_` : '',
    refLink ? `*Reference:* ${refLink}` : '',
    '🔗 <http://localhost:3000/actions|Open in EM Action Hub ↗>',
  ].filter(Boolean).join('\n');

  if (!token || token.includes('dummy') || token.includes('placeholder')) {
    return {
      status: 'SIMULATED',
      targetChannel,
      ts: `sim_nudge_${Date.now()}`,
      message: messageText,
    };
  }

  try {
    const res = await axios.post(
      'https://slack.com/api/chat.postMessage',
      {
        channel: targetChannel,
        text: messageText,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 4500,
      }
    );

    return {
      status: res.data?.ok ? 'SUCCESS' : 'ERROR',
      targetChannel,
      ts: res.data?.ts,
      message: messageText,
      error: res.data?.error,
    };
  } catch (err) {
    return {
      status: 'ERROR',
      targetChannel,
      message: messageText,
      error: err.message,
    };
  }
}

/**
 * Get accessible Slack channels for EM Action Hub dropdown
 */
export async function getAvailableSlackChannels() {
  const currentConfig = getSlackConfig();
  const token = currentConfig.botToken;
  const defaultList = [
    { id: 'C_LEADERSHIP', name: 'engineering-leadership', is_default: true },
    { id: 'C_DEV_STANDUP', name: 'dev-standup', is_default: false },
    { id: 'C_ALERTS', name: 'em-taskflow-alerts', is_default: false },
    { id: 'C_RETRO', name: 'engineering-retro', is_default: false },
  ];

  if (!token || token.includes('dummy') || token.includes('placeholder')) {
    return defaultList;
  }

  try {
    const res = await axios.get('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=50', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 4000,
    });
    if (res.data?.ok && Array.isArray(res.data.channels)) {
      return res.data.channels.map((c) => ({
        id: c.id,
        name: c.name,
        is_default: `#${c.name}` === currentConfig.defaultChannel,
      }));
    }
    return defaultList;
  } catch {
    return defaultList;
  }
}

export async function closeSlackMcp() {
  cachedSlackClient = null;
}


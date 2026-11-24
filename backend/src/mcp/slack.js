/**
 * Slack MCP Tool Suite (GoF Adapter / Facade Pattern)
 * Declarative DynamicStructuredTools and audit dispatch helpers wrapping the unified SlackClient.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import slackClient from '../integrations/clients/SlackClient.js';
import { info, warn, debug } from '../utils/logger.js';
import { recordHandledError } from '../core/safe.js';
import settingsService from '../services/settingsService.js';

/** Format a possibly-missing value for a Slack message without inventing one. */
function na(value, suffix = '') {
  return value === null || value === undefined || value === '' ? 'n/a' : `${value}${suffix}`;
}

export async function testSlackConnection(credentials = {}) {
  return slackClient.testConnection(credentials);
}

export async function getSlackTools() {
  const raw = settingsService.getCachedSettings() || settingsService.cachedRawSettings || {};
  const mcpSlack = raw?.mcp?.slack || {};
  if (mcpSlack.enabled === false) return [];

  const searchTool = new DynamicStructuredTool({
    name: 'slack_search_messages',
    description: 'Searches Slack workspace messages, retro feedback threads, standup notes, and engineering discussion channels.',
    schema: z.object({
      query: z.string().describe('Search query string, keywords, or channel topic (e.g. "retro", "incident", "standup")'),
      channel: z.string().optional().describe('Channel name or ID to filter search within'),
      limit: z.number().default(10).describe('Max number of messages to return'),
    }),
    func: async ({ query, channel, limit = 10 }) => {
      const { token, defaultChannel } = slackClient.getCredentials();
      const targetChannel = channel || defaultChannel;

      if (!token || token.includes('dummy') || token.includes('placeholder')) {
        return JSON.stringify({
          status: 'UNAVAILABLE',
          service: 'slack',
          reason: 'SLACK_BOT_TOKEN_NOT_CONFIGURED',
          message: 'Slack Bot Token (xoxb-...) is not configured. Configure SLACK_BOT_TOKEN in Admin Settings to enable Slack integration.',
          messages: [],
        }, null, 2);
      }

      try {
        debug({ module: 'slackMCP', action: 'slack_search_messages', query, channel: targetChannel }, `Executing slack_search_messages`);
        const res = await slackClient.get(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(targetChannel)}&limit=${limit}`, {
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
          return JSON.stringify({ status: 'SUCCESS', channel: targetChannel, total: filtered.length, messages: filtered }, null, 2);
        }
      } catch (err) {
        warn({ module: 'slackMCP', action: 'slack_search_messages_error', err: err.message }, 'Slack search failed');
      }

      return JSON.stringify({
        status: 'UNAVAILABLE',
        service: 'slack',
        channel: targetChannel,
        query,
        reason: 'SLACK_API_ERROR',
        message: 'Slack API request failed. Verify Slack Bot Token permissions and channel access.',
        messages: [],
      }, null, 2);
    },
  });

  const postTool = new DynamicStructuredTool({
    name: 'slack_post_message',
    description: 'Drafts a Slack post (summary, retro action plan, notification) and queues it for the owner to approve. It never posts directly.',
    schema: z.object({
      message: z.string().describe('Markdown formatted message or executive summary to post'),
      channel: z.string().optional().describe('Target channel name or ID'),
      sprint_name: z.string().optional().describe('Sprint or context name for retrospective posting'),
    }),
    // Write actions never run from the model: this tool can only *request* a post. The owner
    // approves it (Admin, or POST /api/v1/admin/temporal/slack-post/approve) and the Temporal
    // activity sends it. If the approval workflow cannot be started, nothing is posted.
    func: async ({ message, channel, sprint_name }) => {
      const { defaultChannel } = slackClient.getCredentials();
      const targetChannel = channel || defaultChannel;
      try {
        const { startSlackPostHITLWorkflow } = await import('../temporal/client.js');
        const hitlRes = await startSlackPostHITLWorkflow({
          channel: targetChannel,
          message,
          sprintName: sprint_name || 'Current Sprint',
          requestedBy: 'EM TaskFlow Agent',
        });
        if (!hitlRes?.workflowId) throw new Error('approval workflow did not return an id');
        return JSON.stringify({
          status: 'PENDING_HUMAN_APPROVAL',
          workflowId: hitlRes.workflowId,
          target_channel: targetChannel,
          draft_message: message,
          requires_approval: true,
          approval_endpoint: '/api/v1/admin/temporal/slack-post/approve',
          message: 'Draft held for your approval. Nothing has been posted yet.',
        });
      } catch (hitlErr) {
        recordHandledError('mcp.slack.postApproval', hitlErr);
        return JSON.stringify({
          status: 'NOT_POSTED',
          error: 'APPROVAL_UNAVAILABLE',
          target_channel: targetChannel,
          draft_message: message,
          message: `Nothing was posted: the approval workflow could not be started (${hitlErr.message}). Copy the draft manually or retry when Temporal is running.`,
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
    func: async ({ limit = 20 }) => {
      const { token } = slackClient.getCredentials();

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
        debug({ module: 'slackMCP', action: 'slack_list_channels', limit }, `Executing slack_list_channels`);
        const res = await slackClient.get(`https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=${limit}`, {
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
      } catch (err) {
        warn({ module: 'slackMCP', action: 'slack_list_channels_error', err: err.message }, 'Slack list channels failed');
      }

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
  const { defaultChannel, token } = slackClient.getCredentials();
  const targetChannel = channel || defaultChannel;

  // Missing values are shown as n/a: a Slack post must never contain invented numbers.
  const healthScore = auditRun.healthScore ?? null;
  const healthEmoji = healthScore === null ? '⚪' : healthScore >= 85 ? '🟢' : healthScore >= 65 ? '🟡' : '🔴';
  const doraTier = auditRun.doraSummary?.tier || 'n/a';
  const sprintPacing = auditRun.sprintOkrSummary?.sprintPacingPct;
  const overdue1on1s = auditRun.peopleSummary?.overdue1on1sCount;
  const sopScore = auditRun.sopSummary?.complianceScore;

  const actionLines = topActions.length > 0
    ? topActions.slice(0, 4).map((a) => {
        const sevEmoji = a.severity === 'CRITICAL' ? '🚨' : a.severity === 'WARNING' ? '⚠️' : 'ℹ️';
        const assignee = a.assigneeName ? `(@${a.assigneeName})` : '';
        return `• ${sevEmoji} *[${a.category}]* ${a.title} ${assignee}\n   _Action:_ ${a.suggestedAction || 'Review in EM Hub'}`;
      }).join('\n')
    : '• ✅ *No critical blockers detected! All systems healthy.*';

  const messageText = [
    `*${healthEmoji} EM TaskFlow AI — Autonomous Engineering Health Audit*`,
    `*Overall Health Score:* \`${na(healthScore, '/100')}\` | *DORA Tier:* \`${doraTier}\` | *Sprint Pacing:* \`${na(sprintPacing, '%')}\` | *SOP Compliance:* \`${na(sopScore, '%')}\``,
    `*Overdue 1-on-1s:* \`${na(overdue1on1s)}\` | *Pending Actions:* \`${topActions.length}\``,
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
    const res = await slackClient.post(
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
  const { defaultChannel, token } = slackClient.getCredentials();
  const targetChannel = channel || defaultChannel;

  const delivery = auditRun.deliverySummary || {};
  const people = auditRun.peopleSummary || {};
  const sprintOkr = auditRun.sprintOkrSummary || {};
  const sop = auditRun.sopSummary || {};

  const subsections = [
    {
      title: '🚀 *Delivery & DORA Metrics*',
      content: `• *Open PRs:* ${na(delivery.openPrsCount)} | *Stalled PRs (>24h):* ${na(delivery.stalledPrsCount)}\n• *Avg PR Review Latency:* ${na(delivery.avgPrReviewWaitHours, 'h')}\n• *DORA Deployment Frequency:* ${na(auditRun.doraSummary?.deploymentFrequency, '/day')} | *MTTR:* ${na(auditRun.doraSummary?.mttrHours, 'h')}`,
    },
    {
      title: '👥 *People, 1-on-1s & Growth*',
      content: `• *1-on-1 Cadence Health:* ${na(people.cadenceHealth)}\n• *Overdue 1-on-1s (>14d):* ${na(people.overdue1on1sCount)}\n• *Upcoming Milestones:* ${na(people.upcomingMilestones)}`,
    },
    {
      title: '🎯 *Sprint Velocity & OKR Pacing*',
      content: `• *Sprint Completion:* ${na(sprintOkr.completedPoints)}/${na(sprintOkr.totalPoints)} SP (${na(sprintOkr.sprintPacingPct, '%')})\n• *WIP Limit Violations:* ${na(sprintOkr.wipViolations)}\n• *OKR Health:* ${na(sprintOkr.onTrackOkrs)}/${na(sprintOkr.totalOkrs)} objectives on track`,
    },
    {
      title: '🛡️ *SOP, ADR & Governance Compliance*',
      content: `${(sop.checks || []).map((c) => `• *${c.title}:* ${c.status === 'PASS' ? '🟢 PASS' : c.status === 'WARN' ? '🟡 WARN' : c.status === 'FAIL' ? '🔴 FAIL' : '⚪ not checked'}`).join('\n') || '• No governance checks recorded'}\n• *Overall SOP Score:* ${na(sop.complianceScore, '%')}`,
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
      const res = await slackClient.post(
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

export async function sendActionItemNudge({
  actionItem,
  customNote = null,
  channel = null,
  sender = 'Engineering Manager',
} = {}) {
  const { defaultChannel, token } = slackClient.getCredentials();
  const targetChannel = channel || defaultChannel;

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
    const res = await slackClient.post(
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
 * Lists real Slack channels. When Slack is not configured or the API fails, returns an empty
 * list with the reason (it used to return four invented channel IDs).
 * @returns {Promise<{ channels: Array<{id: string, name: string, is_default: boolean}>, available: boolean, reason?: string }>}
 */
export async function listSlackChannelsWithStatus() {
  try {
    const channels = await slackClient.listChannels({ limit: 50 });
    const { defaultChannel } = slackClient.getCredentials();
    if (Array.isArray(channels) && channels.length > 0) {
      return {
        available: true,
        channels: channels.map((c) => ({ id: c.id, name: c.name, is_default: `#${c.name}` === defaultChannel })),
      };
    }
    return { available: false, channels: [], reason: 'Slack returned no channels (check the bot token and its channel scopes).' };
  } catch (err) {
    warn({ module: 'slackMcp', action: 'listChannels', err: err.message }, 'Slack channel listing failed');
    return { available: false, channels: [], reason: `Slack is not reachable: ${err.message}` };
  }
}

export async function getAvailableSlackChannels() {
  const { channels } = await listSlackChannelsWithStatus();
  return channels;
}

export async function closeSlackMcp() {}

export default getSlackTools;

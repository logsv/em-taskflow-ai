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

export async function closeSlackMcp() {
  cachedSlackClient = null;
}

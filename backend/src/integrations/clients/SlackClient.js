/**
 * SlackClient (GoF Adapter / Facade Pattern)
 * Encapsulates Slack Web API communication, token normalization,
 * and structured logging.
 */

import { BaseIntegrationClient } from './BaseIntegrationClient.js';
import settingsService from '../../services/settingsService.js';

export class SlackClient extends BaseIntegrationClient {
  constructor() {
    super('slack', 5000);
  }

  /**
   * Resolves Bot token and channel settings.
   * @param {Record<string, any>} overrides
   */
  getCredentials(overrides = {}) {
    const raw = settingsService.getCachedSettings() || settingsService.cachedRawSettings || {};
    const slack = raw?.mcp?.slack || {};

    const token = (overrides.botToken || overrides.token || slack.botToken || process.env.SLACK_BOT_TOKEN || '').trim();
    const defaultChannel = (overrides.defaultChannel || overrides.channel || slack.defaultChannel || process.env.SLACK_DEFAULT_CHANNEL || '#engineering-retro').trim();

    const cleanToken = token.replace(/^Bearer\s+/i, '');
    const authHeader = cleanToken ? `Bearer ${cleanToken}` : '';

    return { token: cleanToken, defaultChannel, authHeader };
  }

  /**
   * Tests connection to Slack API.
   * @param {Record<string, any>} credentials
   */
  async testConnection(credentials = {}) {
    const { token, authHeader, defaultChannel } = this.getCredentials(credentials);

    if (!token) {
      return this.formatTestResult(false, 'No Slack Bot Token (xoxb-...) provided. Configure SLACK_BOT_TOKEN in Settings or .env');
    }

    try {
      return await this.execute('testConnection', async () => {
        const authRes = await this.post(
          'https://slack.com/api/auth.test',
          {},
          {
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
            timeout: 4500,
          }
        );

        if (!authRes.data?.ok) {
          return this.formatTestResult(false, `Slack Authentication Error: ${authRes.data?.error || 'Invalid Token'}`);
        }

        let channelsCount = 0;
        try {
          const convRes = await this.get('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=20', {
            headers: { Authorization: authHeader },
            timeout: 3000,
          });
          if (convRes.data?.ok && Array.isArray(convRes.data.channels)) {
            channelsCount = convRes.data.channels.length;
          }
        } catch (_convErr) {}

        return this.formatTestResult(true, `Connected to Slack Workspace '${authRes.data.team}' as @${authRes.data.user} (${channelsCount} channels accessible)`, {
          team: authRes.data.team,
          user: authRes.data.user,
          bot_id: authRes.data.bot_id,
          channels_count: channelsCount,
          defaultChannel,
        });
      });
    } catch (err) {
      return this.formatTestResult(false, `Failed to connect to Slack API: ${err.message}`, { error: err.message });
    }
  }

  /**
   * Searches messages in Slack.
   * @param {string} query
   * @param {Record<string, any>} options
   */
  async searchMessages(query, options = {}) {
    const { authHeader } = this.getCredentials(options);
    if (!authHeader) return { ok: false, messages: { matches: [] } };

    return this.execute('searchMessages', async () => {
      const res = await this.get('https://slack.com/api/search.messages', {
        headers: { Authorization: authHeader },
        params: {
          query: query || '',
          count: options.limit || 10,
        },
      });
      return res.data;
    }, { query });
  }

  /**
   * Posts a message to a Slack channel.
   * @param {string} channel
   * @param {string} text
   * @param {Record<string, any>} options
   */
  async postMessage(channel, text, options = {}) {
    const { token, authHeader, defaultChannel } = this.getCredentials(options);
    const targetChannel = channel || defaultChannel;

    if (!token || token.includes('dummy') || token.includes('placeholder')) {
      return {
        ok: false,
        simulated: true,
        channel: targetChannel,
        text,
        ts: `${Date.now()}.000100`,
        message: 'Slack token unconfigured (Simulated delivery)',
      };
    }

    return this.execute('postMessage', async () => {
      const payload = {
        channel: targetChannel,
        text,
      };
      if (options.threadTs) payload.thread_ts = options.threadTs;
      if (options.blocks) payload.blocks = options.blocks;

      const res = await this.post('https://slack.com/api/chat.postMessage', payload, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
      return res.data;
    }, { channel: targetChannel });
  }

  /**
   * Lists available public/private channels in the workspace.
   * @param {Record<string, any>} options
   */
  async listChannels(options = {}) {
    const { authHeader } = this.getCredentials(options);
    if (!authHeader) return [];

    return this.execute('listChannels', async () => {
      const res = await this.get('https://slack.com/api/conversations.list', {
        headers: { Authorization: authHeader },
        params: {
          types: 'public_channel,private_channel',
          exclude_archived: true,
          limit: options.limit || 50,
        },
      });
      return res.data?.channels || [];
    });
  }
}

export const slackClient = new SlackClient();
export default slackClient;

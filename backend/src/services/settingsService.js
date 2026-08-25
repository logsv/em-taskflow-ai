import axios from 'axios';
import databaseService from '../db/postgres.js';
import { config } from '../config.js';
import { info, warn, error } from '../utils/logger.js';
import { closeJiraMcp } from '../mcp/jira.js';
import { closeNotionMcp } from '../mcp/notion.js';
import { closeGithubMcp } from '../mcp/github.js';
import { closeSlackMcp } from '../mcp/slack.js';
import { resetChatModel } from '../llm/index.js';

export function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  const trimmed = secret.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 8) return '••••••••';
  if (trimmed.startsWith('ghp_')) {
    return `ghp_******${trimmed.slice(-4)}`;
  }
  if (trimmed.startsWith('secret_')) {
    return `secret_******${trimmed.slice(-4)}`;
  }
  if (trimmed.startsWith('ntn_')) {
    return `ntn_******${trimmed.slice(-4)}`;
  }
  if (trimmed.startsWith('sk-')) {
    return `sk-******${trimmed.slice(-4)}`;
  }
  if (trimmed.startsWith('xoxb-')) {
    return `xoxb-******${trimmed.slice(-4)}`;
  }
  if (trimmed.startsWith('xapp-')) {
    return `xapp-******${trimmed.slice(-4)}`;
  }
  if (trimmed.startsWith('xoxp-')) {
    return `xoxp-******${trimmed.slice(-4)}`;
  }
  return `${trimmed.slice(0, 3)}******${trimmed.slice(-4)}`;
}

export function isMasked(value) {
  if (!value || typeof value !== 'string') return false;
  return value.includes('******') || value.includes('••••');
}

class SettingsService {
  constructor() {
    this.cachedRawSettings = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized && this.cachedRawSettings) return this.cachedRawSettings;

    try {
      const dbSettings = await databaseService.getAllAppSettings();
      if (!dbSettings.llm || !dbSettings.mcp) {
        this.cachedRawSettings = await this.seedInitialSettingsFromEnv();
      } else {
        this.cachedRawSettings = {
          llm: dbSettings.llm?.value || {},
          mcp: dbSettings.mcp?.value || {},
          metadata: {
            llmSource: dbSettings.llm?.source || 'database',
            mcpSource: dbSettings.mcp?.source || 'database',
            llmUpdatedAt: dbSettings.llm?.updated_at,
            mcpUpdatedAt: dbSettings.mcp?.updated_at,
          },
        };
      }
      this.applyToRuntimeConfig(this.cachedRawSettings);
      this.initialized = true;
      info('✅ SettingsService initialized with database configuration');
      return this.cachedRawSettings;
    } catch (err) {
      warn('⚠️ Failed to load settings from database, falling back to environment defaults', { err: err.message });
      this.cachedRawSettings = this.getDefaultEnvSettings();
      this.applyToRuntimeConfig(this.cachedRawSettings);
      this.initialized = true;
      return this.cachedRawSettings;
    }
  }

  getCachedSettings() {
    if (!this.cachedRawSettings) {
      this.cachedRawSettings = this.getDefaultEnvSettings();
    }
    return this.cachedRawSettings;
  }

  getDefaultEnvSettings() {
    return {
      llm: {
        defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'ollama',
        defaultModel: process.env.LLM_DEFAULT_MODEL || 'hermes3:8b',
        availableModels: [
          'hermes3:8b',
          'qwen2.5:14b',
          'mistral-small:24b',
          'qwen2.5:32b',
          'command-r:35b',
          'llama3.3:70b',
          'gpt-oss:20b',
          'mistral:latest',
          'llama3.1:8b',
          'nomic-embed-text'
        ],
        temperature: 0.2,
        ollama: {
          baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          enabled: process.env.LLM_OLLAMA_ENABLED !== 'false',
        },
        openai: {
          apiKey: process.env.OPENAI_API_KEY || '',
          baseUrl: process.env.LLM_OPENAI_BASE_URL || 'https://api.openai.com/v1',
          enabled: process.env.LLM_OPENAI_ENABLED === 'true',
        },
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          baseUrl: process.env.LLM_ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
          enabled: process.env.LLM_ANTHROPIC_ENABLED === 'true',
        },
        google: {
          apiKey: process.env.GOOGLE_API_KEY || '',
          baseUrl: process.env.LLM_GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
          enabled: process.env.LLM_GOOGLE_ENABLED === 'true',
        },
      },
      mcp: {
        jira: {
          url: process.env.JIRA_BASE_URL || process.env.JIRA_URL || 'https://your-company.atlassian.net',
          email: process.env.JIRA_USER_EMAIL || process.env.JIRA_USERNAME || '',
          apiToken: process.env.JIRA_API_TOKEN || process.env.JIRA_MCP_TOKEN || '',
          mcpUrl: process.env.JIRA_MCP_URL || 'https://mcp.atlassian.com/v1/mcp/authv2',
          projectKey: process.env.JIRA_PROJECT_KEY || '',
          oauth: {
            clientId: process.env.JIRA_OAUTH_CLIENT_ID || '',
            clientSecret: process.env.JIRA_OAUTH_CLIENT_SECRET || '',
            redirectUrl: process.env.JIRA_OAUTH_REDIRECT_URL || 'http://localhost:5001/api/mcp/jira/oauth/callback',
            scope: 'read:jira-work read:jira-user offline_access',
          },
          enabled: true,
        },
        github: {
          token: process.env.GITHUB_TOKEN || '',
          owner: process.env.GITHUB_OWNER || 'logsv',
          repo: process.env.GITHUB_REPO || 'em-taskflow-ai',
          enabled: true,
        },
        notion: {
          apiKey: process.env.NOTION_API_KEY || '',
          mcpUrl: process.env.NOTION_MCP_URL || '',
          enabled: true,
        },
        googleCalendar: {
          apiKey: process.env.GOOGLE_CALENDAR_API_KEY || '',
          calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          enabled: true,
        },
        slack: {
          botToken: process.env.SLACK_BOT_TOKEN || '',
          signingSecret: process.env.SLACK_SIGNING_SECRET || '',
          appToken: process.env.SLACK_APP_TOKEN || '',
          defaultChannel: process.env.SLACK_DEFAULT_CHANNEL || '#engineering-retro',
          teamId: process.env.SLACK_TEAM_ID || '',
          enabled: true,
        },
      },
      metadata: {
        llmSource: 'migrated_env',
        mcpSource: 'migrated_env',
        llmUpdatedAt: new Date().toISOString(),
        mcpUpdatedAt: new Date().toISOString(),
      },
    };
  }

  async seedInitialSettingsFromEnv() {
    const defaults = this.getDefaultEnvSettings();
    await databaseService.setAppSetting('llm', defaults.llm, 'migrated_env');
    await databaseService.setAppSetting('mcp', defaults.mcp, 'migrated_env');
    info('✅ Auto-migrated initial .env configuration into PostgreSQL app_settings table');
    return defaults;
  }

  applyToRuntimeConfig(rawSettings) {
    if (!rawSettings) return;

    if (rawSettings.llm) {
      config.llm.defaultProvider = rawSettings.llm.defaultProvider || config.llm.defaultProvider;
      config.llm.defaultModel = rawSettings.llm.defaultModel || config.llm.defaultModel;
      if (rawSettings.llm.ollama?.baseUrl) {
        process.env.OLLAMA_BASE_URL = rawSettings.llm.ollama.baseUrl;
        if (config.llm.providers?.ollama) {
          config.llm.providers.ollama.baseUrl = rawSettings.llm.ollama.baseUrl;
        }
      }
      if (rawSettings.llm.openai?.apiKey) {
        process.env.OPENAI_API_KEY = rawSettings.llm.openai.apiKey;
      }
    }

    if (rawSettings.mcp) {
      if (rawSettings.mcp.jira) {
        if (rawSettings.mcp.jira.url) process.env.JIRA_BASE_URL = rawSettings.mcp.jira.url;
        if (rawSettings.mcp.jira.email) process.env.JIRA_USER_EMAIL = rawSettings.mcp.jira.email;
        if (rawSettings.mcp.jira.apiToken) {
          process.env.JIRA_API_TOKEN = rawSettings.mcp.jira.apiToken;
          process.env.JIRA_MCP_TOKEN = rawSettings.mcp.jira.apiToken;
        }
        if (rawSettings.mcp.jira.projectKey) process.env.JIRA_PROJECT_KEY = rawSettings.mcp.jira.projectKey;
        if (rawSettings.mcp.jira.mcpUrl) process.env.JIRA_MCP_URL = rawSettings.mcp.jira.mcpUrl;
        if (rawSettings.mcp.jira.oauth?.clientId) process.env.JIRA_OAUTH_CLIENT_ID = rawSettings.mcp.jira.oauth.clientId;
        if (rawSettings.mcp.jira.oauth?.clientSecret) process.env.JIRA_OAUTH_CLIENT_SECRET = rawSettings.mcp.jira.oauth.clientSecret;
        if (rawSettings.mcp.jira.oauth?.redirectUrl) process.env.JIRA_OAUTH_REDIRECT_URL = rawSettings.mcp.jira.oauth.redirectUrl;
      }
      if (rawSettings.mcp.github) {
        if (rawSettings.mcp.github.token) process.env.GITHUB_TOKEN = rawSettings.mcp.github.token;
        if (rawSettings.mcp.github.owner) process.env.GITHUB_OWNER = rawSettings.mcp.github.owner;
        if (rawSettings.mcp.github.repo) process.env.GITHUB_REPO = rawSettings.mcp.github.repo;
      }
      if (rawSettings.mcp.notion) {
        if (rawSettings.mcp.notion.apiKey) process.env.NOTION_API_KEY = rawSettings.mcp.notion.apiKey;
        if (rawSettings.mcp.notion.mcpUrl) process.env.NOTION_MCP_URL = rawSettings.mcp.notion.mcpUrl;
      }
      if (rawSettings.mcp.slack) {
        if (rawSettings.mcp.slack.botToken) process.env.SLACK_BOT_TOKEN = rawSettings.mcp.slack.botToken;
        if (rawSettings.mcp.slack.signingSecret) process.env.SLACK_SIGNING_SECRET = rawSettings.mcp.slack.signingSecret;
        if (rawSettings.mcp.slack.appToken) process.env.SLACK_APP_TOKEN = rawSettings.mcp.slack.appToken;
        if (rawSettings.mcp.slack.defaultChannel) process.env.SLACK_DEFAULT_CHANNEL = rawSettings.mcp.slack.defaultChannel;
        if (rawSettings.mcp.slack.teamId) process.env.SLACK_TEAM_ID = rawSettings.mcp.slack.teamId;
      }
    }
  }

  async getMaskedSettings() {
    await this.initialize();
    const raw = this.cachedRawSettings;

    return {
      llm: {
        defaultProvider: raw.llm.defaultProvider || 'ollama',
        defaultModel: raw.llm.defaultModel || 'hermes3:8b',
        availableModels: raw.llm.availableModels || ['hermes3:8b', 'mistral:latest', 'llama3.1:8b', 'qwen2.5:7b'],
        temperature: raw.llm.temperature ?? 0.2,
        ollama: {
          baseUrl: raw.llm.ollama?.baseUrl || 'http://localhost:11434',
          enabled: raw.llm.ollama?.enabled ?? true,
        },
        openai: {
          apiKey: maskSecret(raw.llm.openai?.apiKey),
          baseUrl: raw.llm.openai?.baseUrl || 'https://api.openai.com/v1',
          enabled: raw.llm.openai?.enabled ?? false,
        },
        anthropic: {
          apiKey: maskSecret(raw.llm.anthropic?.apiKey),
          baseUrl: raw.llm.anthropic?.baseUrl || 'https://api.anthropic.com/v1',
          enabled: raw.llm.anthropic?.enabled ?? false,
        },
        google: {
          apiKey: maskSecret(raw.llm.google?.apiKey),
          baseUrl: raw.llm.google?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai',
          enabled: raw.llm.google?.enabled ?? false,
        },
      },
      mcp: {
        jira: {
          url: raw.mcp.jira?.url || '',
          email: raw.mcp.jira?.email || '',
          projectKey: raw.mcp.jira?.projectKey || '',
          apiToken: maskSecret(raw.mcp.jira?.apiToken),
          mcpUrl: raw.mcp.jira?.mcpUrl || '',
          oauth: {
            clientId: raw.mcp.jira?.oauth?.clientId || '',
            clientSecret: maskSecret(raw.mcp.jira?.oauth?.clientSecret),
            redirectUrl: raw.mcp.jira?.oauth?.redirectUrl || 'http://localhost:5001/api/mcp/jira/oauth/callback',
          },
          enabled: raw.mcp.jira?.enabled ?? true,
        },
        github: {
          token: maskSecret(raw.mcp.github?.token),
          owner: raw.mcp.github?.owner || '',
          repo: raw.mcp.github?.repo || '',
          enabled: raw.mcp.github?.enabled ?? true,
        },
        notion: {
          apiKey: maskSecret(raw.mcp.notion?.apiKey),
          mcpUrl: raw.mcp.notion?.mcpUrl || '',
          enabled: raw.mcp.notion?.enabled ?? true,
        },
        googleCalendar: {
          apiKey: maskSecret(raw.mcp.googleCalendar?.apiKey),
          calendarId: raw.mcp.googleCalendar?.calendarId || 'primary',
          clientId: raw.mcp.googleCalendar?.clientId || '',
          enabled: raw.mcp.googleCalendar?.enabled ?? true,
        },
        slack: {
          botToken: maskSecret(raw.mcp.slack?.botToken),
          signingSecret: maskSecret(raw.mcp.slack?.signingSecret),
          appToken: maskSecret(raw.mcp.slack?.appToken),
          defaultChannel: raw.mcp.slack?.defaultChannel || '#engineering-retro',
          teamId: raw.mcp.slack?.teamId || '',
          enabled: raw.mcp.slack?.enabled ?? true,
        },
      },
      metadata: raw.metadata || {
        llmSource: 'database',
        mcpSource: 'database',
        llmUpdatedAt: new Date().toISOString(),
        mcpUpdatedAt: new Date().toISOString(),
      },
    };
  }

  async updateSettings(incoming) {
    await this.initialize();
    const current = this.cachedRawSettings;

    // Merge LLM Settings
    const updatedLlm = {
      defaultProvider: incoming.llm?.defaultProvider || current.llm.defaultProvider || 'ollama',
      defaultModel: incoming.llm?.defaultModel || current.llm.defaultModel || 'hermes3:8b',
      availableModels: incoming.llm?.availableModels || current.llm.availableModels || ['hermes3:8b', 'mistral:latest'],
      temperature: incoming.llm?.temperature ?? current.llm.temperature ?? 0.2,
      ollama: {
        baseUrl: incoming.llm?.ollama?.baseUrl || current.llm.ollama?.baseUrl || 'http://localhost:11434',
        enabled: incoming.llm?.ollama?.enabled ?? current.llm.ollama?.enabled ?? true,
      },
      openai: {
        apiKey: isMasked(incoming.llm?.openai?.apiKey) ? current.llm.openai?.apiKey : incoming.llm?.openai?.apiKey ?? current.llm.openai?.apiKey,
        baseUrl: incoming.llm?.openai?.baseUrl || current.llm.openai?.baseUrl || 'https://api.openai.com/v1',
        enabled: incoming.llm?.openai?.enabled ?? current.llm.openai?.enabled ?? false,
      },
      anthropic: {
        apiKey: isMasked(incoming.llm?.anthropic?.apiKey) ? current.llm.anthropic?.apiKey : incoming.llm?.anthropic?.apiKey ?? current.llm.anthropic?.apiKey,
        baseUrl: incoming.llm?.anthropic?.baseUrl || current.llm.anthropic?.baseUrl || 'https://api.anthropic.com/v1',
        enabled: incoming.llm?.anthropic?.enabled ?? current.llm.anthropic?.enabled ?? false,
      },
      google: {
        apiKey: isMasked(incoming.llm?.google?.apiKey) ? current.llm.google?.apiKey : incoming.llm?.google?.apiKey ?? current.llm.google?.apiKey,
        baseUrl: incoming.llm?.google?.baseUrl || current.llm.google?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai',
        enabled: incoming.llm?.google?.enabled ?? current.llm.google?.enabled ?? false,
      },
    };

    // Merge MCP Settings
    const updatedMcp = {
      jira: {
        url: incoming.mcp?.jira?.url || current.mcp.jira?.url || '',
        email: incoming.mcp?.jira?.email || current.mcp.jira?.email || '',
        projectKey: incoming.mcp?.jira?.projectKey || current.mcp.jira?.projectKey || '',
        apiToken: isMasked(incoming.mcp?.jira?.apiToken) ? current.mcp.jira?.apiToken : incoming.mcp?.jira?.apiToken ?? current.mcp.jira?.apiToken,
        mcpUrl: incoming.mcp?.jira?.mcpUrl || current.mcp.jira?.mcpUrl || '',
        oauth: {
          clientId: incoming.mcp?.jira?.oauth?.clientId ?? current.mcp.jira?.oauth?.clientId ?? '',
          clientSecret: isMasked(incoming.mcp?.jira?.oauth?.clientSecret)
            ? current.mcp.jira?.oauth?.clientSecret
            : incoming.mcp?.jira?.oauth?.clientSecret ?? current.mcp.jira?.oauth?.clientSecret ?? '',
          redirectUrl: incoming.mcp?.jira?.oauth?.redirectUrl || current.mcp.jira?.oauth?.redirectUrl || 'http://localhost:5001/api/mcp/jira/oauth/callback',
        },
        enabled: incoming.mcp?.jira?.enabled ?? current.mcp.jira?.enabled ?? true,
      },
      github: {
        token: isMasked(incoming.mcp?.github?.token) ? current.mcp.github?.token : incoming.mcp?.github?.token ?? current.mcp.github?.token,
        owner: incoming.mcp?.github?.owner || current.mcp.github?.owner || '',
        repo: incoming.mcp?.github?.repo || current.mcp.github?.repo || '',
        enabled: incoming.mcp?.github?.enabled ?? current.mcp.github?.enabled ?? true,
      },
      notion: {
        apiKey: isMasked(incoming.mcp?.notion?.apiKey) ? current.mcp.notion?.apiKey : incoming.mcp?.notion?.apiKey ?? current.mcp.notion?.apiKey,
        mcpUrl: incoming.mcp?.notion?.mcpUrl || current.mcp.notion?.mcpUrl || '',
        enabled: incoming.mcp?.notion?.enabled ?? current.mcp.notion?.enabled ?? true,
      },
      googleCalendar: {
        apiKey: isMasked(incoming.mcp?.googleCalendar?.apiKey)
          ? current.mcp.googleCalendar?.apiKey
          : incoming.mcp?.googleCalendar?.apiKey ?? current.mcp.googleCalendar?.apiKey,
        calendarId: incoming.mcp?.googleCalendar?.calendarId || current.mcp.googleCalendar?.calendarId || 'primary',
        clientId: incoming.mcp?.googleCalendar?.clientId || current.mcp.googleCalendar?.clientId || '',
        enabled: incoming.mcp?.googleCalendar?.enabled ?? current.mcp.googleCalendar?.enabled ?? true,
      },
      slack: {
        botToken: isMasked(incoming.mcp?.slack?.botToken)
          ? current.mcp.slack?.botToken
          : incoming.mcp?.slack?.botToken ?? current.mcp.slack?.botToken ?? '',
        signingSecret: isMasked(incoming.mcp?.slack?.signingSecret)
          ? current.mcp.slack?.signingSecret
          : incoming.mcp?.slack?.signingSecret ?? current.mcp.slack?.signingSecret ?? '',
        appToken: isMasked(incoming.mcp?.slack?.appToken)
          ? current.mcp.slack?.appToken
          : incoming.mcp?.slack?.appToken ?? current.mcp.slack?.appToken ?? '',
        defaultChannel: incoming.mcp?.slack?.defaultChannel || current.mcp.slack?.defaultChannel || '#engineering-retro',
        teamId: incoming.mcp?.slack?.teamId || current.mcp.slack?.teamId || '',
        enabled: incoming.mcp?.slack?.enabled ?? current.mcp.slack?.enabled ?? true,
      },
    };

    // Save to Database
    const llmRec = await databaseService.setAppSetting('llm', updatedLlm, 'database');
    const mcpRec = await databaseService.setAppSetting('mcp', updatedMcp, 'database');

    this.cachedRawSettings = {
      llm: updatedLlm,
      mcp: updatedMcp,
      metadata: {
        llmSource: 'database',
        mcpSource: 'database',
        llmUpdatedAt: llmRec.updated_at || new Date().toISOString(),
        mcpUpdatedAt: mcpRec.updated_at || new Date().toISOString(),
      },
    };

    // Hot reload runtime config and reset active LLM model singleton
    this.applyToRuntimeConfig(this.cachedRawSettings);
    resetChatModel();

    // Reset MCP cached clients so the next call picks up the new credentials
    await closeJiraMcp().catch(() => {});
    await closeNotionMcp().catch(() => {});
    await closeGithubMcp().catch(() => {});
    await closeSlackMcp().catch(() => {});

    info('✅ Settings saved to database and hot-reloaded into active runtime');
    return this.getMaskedSettings();
  }

  async resetToEnvDefaults() {
    const defaults = this.getDefaultEnvSettings();
    const llmRec = await databaseService.setAppSetting('llm', defaults.llm, 'migrated_env');
    const mcpRec = await databaseService.setAppSetting('mcp', defaults.mcp, 'migrated_env');

    this.cachedRawSettings = {
      llm: defaults.llm,
      mcp: defaults.mcp,
      metadata: {
        llmSource: 'migrated_env',
        mcpSource: 'migrated_env',
        llmUpdatedAt: llmRec.updated_at || new Date().toISOString(),
        mcpUpdatedAt: mcpRec.updated_at || new Date().toISOString(),
      },
    };

    this.applyToRuntimeConfig(this.cachedRawSettings);
    resetChatModel();
    await closeJiraMcp().catch(() => {});
    await closeNotionMcp().catch(() => {});
    await closeGithubMcp().catch(() => {});
    await closeSlackMcp().catch(() => {});

    info('🔄 Restored settings to .env defaults');
    return this.getMaskedSettings();
  }

  async testConnection(type, credentials = {}) {
    await this.initialize();
    const raw = this.cachedRawSettings;
    const startTime = Date.now();

    try {
      if (type === 'ollama') {
        const baseUrl = credentials.baseUrl || raw.llm.ollama?.baseUrl || 'http://localhost:11434';
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/tags`, { timeout: 3500 });
        const models = (res.data?.models || []).map((m) => m.name);
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Connected to Ollama (${models.length} model(s) installed)`,
          models,
        };
      }

      if (type === 'jira') {
        const url = (credentials.url !== undefined ? credentials.url : raw.mcp.jira?.url) || process.env.JIRA_URL || '';
        const mcpUrl = (credentials.mcpUrl !== undefined ? credentials.mcpUrl : raw.mcp.jira?.mcpUrl) || 'https://mcp.atlassian.com/v1/mcp/authv2';
        const email = credentials.email !== undefined ? credentials.email : raw.mcp.jira?.email;
        const token = isMasked(credentials.apiToken)
          ? raw.mcp.jira?.apiToken
          : credentials.apiToken !== undefined ? credentials.apiToken : raw.mcp.jira?.apiToken;

        // If user explicitly testing Atlassian Remote MCP Cloud (OAuth 2.1)
        if (credentials.mode === 'mcp' || (url.includes('mcp.atlassian.com') && token)) {
          const mcpTarget = url.includes('mcp.atlassian.com') ? url : mcpUrl;
          try {
            const mcpRes = await axios.post(
              mcpTarget,
              {
                jsonrpc: '2.0',
                method: 'initialize',
                params: {
                  protocolVersion: '2024-11-05',
                  capabilities: {},
                  clientInfo: { name: 'EM-TaskFlow-AI', version: '1.0.0' },
                },
                id: 1,
              },
              {
                headers: {
                  Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                timeout: 4500,
              }
            );
            return {
              success: true,
              latencyMs: Date.now() - startTime,
              message: `Connected to Official Atlassian Remote MCP (${mcpTarget})`,
            };
          } catch (mcpErr) {
            return {
              success: false,
              latencyMs: Date.now() - startTime,
              message: `Remote Atlassian MCP error: ${mcpErr.response?.data?.error || mcpErr.message}`,
            };
          }
        }

        if (!url || !url.startsWith('http')) {
          return { success: false, latencyMs: 0, message: 'Invalid Jira URL provided (e.g. https://your-company.atlassian.net)' };
        }

        const authHeader = email && token
          ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
          : token ? (token.startsWith('Basic ') || token.startsWith('Bearer ') ? token : `Bearer ${token}`) : null;

        const res = await axios.get(`${url.replace(/\/$/, '')}/rest/api/3/myself`, {
          headers: authHeader ? { Authorization: authHeader, Accept: 'application/json' } : { Accept: 'application/json' },
          timeout: 4500,
        });

        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Connected as ${res.data?.displayName || res.data?.emailAddress || 'Jira User'} (${res.data?.emailAddress || url})`,
        };
      }

      if (type === 'github') {
        const token = isMasked(credentials.token)
          ? raw.mcp.github?.token
          : credentials.token !== undefined ? credentials.token : raw.mcp.github?.token;
        if (!token) {
          return { success: false, latencyMs: 0, message: 'No GitHub Personal Access Token configured' };
        }
        const res = await axios.get('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
          timeout: 4500,
        });

        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Connected as @${res.data?.login} (${res.data?.name || 'GitHub User'})`,
        };
      }

      if (type === 'notion') {
        const apiKey = isMasked(credentials.apiKey)
          ? raw.mcp.notion?.apiKey
          : credentials.apiKey !== undefined ? credentials.apiKey : raw.mcp.notion?.apiKey;
        if (!apiKey) {
          return { success: false, latencyMs: 0, message: 'No Notion API Key configured' };
        }
        const res = await axios.post(
          'https://api.notion.com/v1/search',
          { page_size: 3 },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json',
            },
            timeout: 4500,
          }
        );

        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Connected to Notion (${res.data?.results?.length || 0} accessible page(s) found)`,
        };
      }

      if (type === 'googleCalendar' || type === 'google_calendar') {
        const calendarId = encodeURIComponent(credentials.calendarId || raw.mcp.googleCalendar?.calendarId || 'primary');
        const apiKey = isMasked(credentials.apiKey)
          ? raw.mcp.googleCalendar?.apiKey
          : credentials.apiKey !== undefined ? credentials.apiKey : raw.mcp.googleCalendar?.apiKey;

        if (!apiKey) {
          return { success: false, latencyMs: 0, message: 'No Google Calendar API Key / Token configured' };
        }

        const res = await axios.get(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=5&timeMin=${new Date().toISOString()}&key=${apiKey}`,
          { timeout: 4500 }
        );

        const items = res.data?.items || [];
        return {
          success: true,
          latencyMs: Date.now() - startTime,
          message: `Connected to Google Calendar (${items.length} upcoming event(s) found)`,
          events: items.map((ev) => ({ summary: ev.summary, start: ev.start?.dateTime || ev.start?.date })),
        };
      }

      if (type === 'slack') {
        const { testSlackConnection } = await import('../mcp/slack.js');
        return testSlackConnection(credentials);
      }

      return { success: false, latencyMs: 0, message: `Unknown connection test type: ${type}` };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: err?.response?.data?.message || err?.message || 'Connection test failed',
      };
    }
  }

  /**
   * Get OAuth tokens for a specific provider from DB preferences
   */
  async getOAuthTokens(provider) {
    try {
      const prefKey = `mcp.${provider}.oauth.tokens`;
      const pref = await databaseService.getPreference(prefKey);
      if (pref?.value) {
        return typeof pref.value === 'string' ? JSON.parse(pref.value) : pref.value;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Save OAuth tokens for a specific provider into DB preferences
   */
  async saveOAuthTokens(provider, tokens) {
    try {
      const prefKey = `mcp.${provider}.oauth.tokens`;
      await databaseService.setPreference(prefKey, tokens);
      return true;
    } catch {
      return false;
    }
  }
}

const settingsService = new SettingsService();
export default settingsService;

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import databaseService from '../db/postgres.js';
import { config } from '../config.js';
import { info, warn, error } from '../utils/logger.js';
import { closeJiraMcp } from '../mcp/jira.js';
import { closeNotionMcp } from '../mcp/notion.js';
import { closeGithubMcp } from '../mcp/github.js';
import { closeSlackMcp } from '../mcp/slack.js';
import { closeGoogleMcp } from '../mcp/google.js';
import { resetChatModel } from '../llm/index.js';
import { cacheInvalidator } from '../cache/cacheInvalidator.js';

export function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  const trimmed = secret.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 8) return '******';
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
  return value.includes('******') || value.includes('••••') || value.includes('•');
}

class SettingsService {
  constructor() {
    this.cachedRawSettings = null;
    this.initialized = false;
  }

  sanitizeSettings(rawSettings) {
    if (!rawSettings) return rawSettings;
    const defaults = this.getDefaultEnvSettings();

    if (rawSettings.mcp?.jira) {
      if (!rawSettings.mcp.jira.email) {
        rawSettings.mcp.jira.email = defaults.mcp.jira.email;
      }
      if (!rawSettings.mcp.jira.url) {
        rawSettings.mcp.jira.url = defaults.mcp.jira.url;
      }
      if (rawSettings.mcp.jira.oauth?.redirectUrl?.includes(':5001') || !rawSettings.mcp.jira.oauth?.redirectUrl) {
        if (!rawSettings.mcp.jira.oauth) rawSettings.mcp.jira.oauth = {};
        rawSettings.mcp.jira.oauth.redirectUrl = defaults.mcp.jira.oauth.redirectUrl;
      }
    }

    if (rawSettings.mcp?.github) {
      if (!rawSettings.mcp.github.owner) {
        rawSettings.mcp.github.owner = defaults.mcp.github.owner;
      }
      if (!rawSettings.mcp.github.repo) {
        rawSettings.mcp.github.repo = defaults.mcp.github.repo;
      }
    }

    return rawSettings;
  }

  getBackupFilePath() {
    const candidateDirs = [
      path.resolve(process.cwd(), 'data'),
      path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../data'),
      path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../data'),
    ];
    for (const d of candidateDirs) {
      try {
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
        return path.join(d, 'settings-backup.json');
      } catch (_e) {}
    }
    return path.resolve(process.cwd(), 'settings-backup.json');
  }

  saveBackupToDisk(settings) {
    if (!settings || process.env.NODE_ENV === 'test') return;
    try {
      const filePath = this.getBackupFilePath();
      const dataToSave = {
        llm: settings.llm || {},
        mcp: settings.mcp || {},
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      info('💾 Saved durable settings backup to disk', { filePath });
    } catch (err) {
      warn('Failed to save settings backup to disk', { err: err.message });
    }
  }

  loadBackupFromDisk() {
    try {
      const filePath = this.getBackupFilePath();
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      warn('Failed to load settings backup from disk', { err: err.message });
    }
    return null;
  }

  mergeWithBackup(target, backup) {
    if (!backup || !backup.mcp || !target || !target.mcp) return false;
    let mutated = false;
    const tools = ['jira', 'github', 'notion', 'googleCalendar', 'slack'];
    for (const tool of tools) {
      const bTool = backup.mcp[tool];
      if (!bTool) continue;
      if (!target.mcp[tool]) target.mcp[tool] = {};
      const tTool = target.mcp[tool];

      if (tool === 'jira') {
        if ((!tTool.apiToken || tTool.apiToken === 'test_token_12345678') && bTool.apiToken && bTool.apiToken !== 'test_token_12345678') {
          tTool.apiToken = bTool.apiToken;
          mutated = true;
        }
        if (!tTool.url && bTool.url) { tTool.url = bTool.url; mutated = true; }
        if (!tTool.email && bTool.email) { tTool.email = bTool.email; mutated = true; }
      } else if (tool === 'github') {
        if ((!tTool.token || tTool.token.includes('mock')) && bTool.token && !bTool.token.includes('mock')) {
          tTool.token = bTool.token;
          mutated = true;
        }
        if (!tTool.owner && bTool.owner) { tTool.owner = bTool.owner; mutated = true; }
        if (!tTool.repo && bTool.repo) { tTool.repo = bTool.repo; mutated = true; }
      } else if (tool === 'notion') {
        if ((!tTool.apiKey || tTool.apiKey.includes('mock')) && bTool.apiKey && !bTool.apiKey.includes('mock')) {
          tTool.apiKey = bTool.apiKey;
          mutated = true;
        }
      } else if (tool === 'googleCalendar') {
        if ((!tTool.apiKey || tTool.apiKey.includes('Mock')) && bTool.apiKey && !bTool.apiKey.includes('Mock')) {
          tTool.apiKey = bTool.apiKey;
          mutated = true;
        }
      } else if (tool === 'slack') {
        if ((!tTool.botToken || tTool.botToken.includes('mock')) && bTool.botToken && !bTool.botToken.includes('mock')) {
          tTool.botToken = bTool.botToken;
          mutated = true;
        }
      }
    }
    return mutated;
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

        // Self-heal from durable backup if DB has empty tokens but backup has valid keys
        if (process.env.NODE_ENV !== 'test') {
          const backup = this.loadBackupFromDisk();
          if (backup && this.mergeWithBackup(this.cachedRawSettings, backup)) {
            info('🔄 Self-healed and restored tool credentials from local backup file into PostgreSQL');
            await databaseService.setAppSetting('mcp', this.cachedRawSettings.mcp, 'database').catch(() => {});
          }
        }

        // Migrate legacy dummy placeholders if found in live database
        if (process.env.NODE_ENV !== 'test') {
          if (this.cachedRawSettings.mcp?.jira?.email === 'lead@testcompany.com' || this.cachedRawSettings.mcp?.jira?.email === 'alex@company.com') {
            this.cachedRawSettings.mcp.jira.email = process.env.JIRA_USER_EMAIL || '';
          }
          if (this.cachedRawSettings.mcp?.jira?.oauth?.redirectUrl?.includes(':5001')) {
            if (!this.cachedRawSettings.mcp.jira.oauth) this.cachedRawSettings.mcp.jira.oauth = {};
            this.cachedRawSettings.mcp.jira.oauth.redirectUrl = process.env.JIRA_OAUTH_REDIRECT_URL || 'http://localhost:4000/api/mcp/jira/oauth/callback';
          }
        }

        this.sanitizeSettings(this.cachedRawSettings);
        // Persist sanitized clean values back to PostgreSQL
        await databaseService.setAppSetting('llm', this.cachedRawSettings.llm, this.cachedRawSettings.metadata.llmSource).catch(() => {});
        await databaseService.setAppSetting('mcp', this.cachedRawSettings.mcp, this.cachedRawSettings.metadata.mcpSource).catch(() => {});
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

  reloadEnvFromDisk() {
    try {
      const envPaths = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../.env'),
        path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../.env'),
        path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../.env'),
      ];
      for (const p of envPaths) {
        if (fs.existsSync(p)) {
          dotenv.config({ path: p, override: true });
        }
      }
    } catch (_e) {}
  }

  getDefaultEnvSettings() {
    this.reloadEnvFromDisk();
    return {
      llm: {
        defaultProvider: process.env.LLM_DEFAULT_PROVIDER || process.env.LLM_PROVIDER || 'ollama',
        defaultModel: process.env.LLM_DEFAULT_MODEL || process.env.OLLAMA_MODEL || process.env.DEFAULT_LLM_MODEL || 'hermes3:8b',
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
          'nomic-embed-text',
        ],
        temperature: process.env.LLM_TEMPERATURE !== undefined ? Number(process.env.LLM_TEMPERATURE) : 0.2,
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
          url: process.env.JIRA_BASE_URL || process.env.JIRA_URL || '',
          email: process.env.JIRA_USER_EMAIL || process.env.JIRA_USERNAME || '',
          apiToken: process.env.JIRA_API_TOKEN || process.env.JIRA_MCP_TOKEN || '',
          mcpUrl: process.env.JIRA_MCP_URL || 'https://mcp.atlassian.com/v1/mcp/authv2',
          projectKey: process.env.JIRA_PROJECT_KEY || '',
          oauth: {
            clientId: process.env.JIRA_OAUTH_CLIENT_ID || '',
            clientSecret: process.env.JIRA_OAUTH_CLIENT_SECRET || '',
            redirectUrl: process.env.JIRA_OAUTH_REDIRECT_URL || 'http://localhost:4000/api/mcp/jira/oauth/callback',
            scope: 'read:jira-work read:jira-user offline_access',
          },
          enabled: true,
        },
        github: {
          token: process.env.GITHUB_TOKEN || '',
          owner: process.env.GITHUB_OWNER || '',
          repo: process.env.GITHUB_REPO || '',
          enabled: true,
        },
        notion: {
          apiKey: process.env.NOTION_API_KEY || '',
          mcpUrl: process.env.NOTION_MCP_URL || '',
          okrPageId: process.env.NOTION_OKR_PAGE_ID || '',
          retroPageId: process.env.NOTION_RETRO_PAGE_ID || '',
          sopPageId: process.env.NOTION_SOP_PAGE_ID || '',
          careerPageId: process.env.NOTION_CAREER_PAGE_ID || '',
          sprintGoalsPageId: process.env.NOTION_SPRINT_GOALS_PAGE_ID || '',
          enabled: true,
        },
        googleCalendar: {
          apiKey: process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_CALENDAR_TOKEN || process.env.GOOGLE_OAUTH_TOKEN || '',
          calendarId: process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_USER_EMAIL || 'primary',
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          enabled: true,
        },
        slack: {
          botToken: process.env.SLACK_BOT_TOKEN || '',
          signingSecret: process.env.SLACK_SIGNING_SECRET || '',
          appToken: process.env.SLACK_APP_TOKEN || '',
          defaultChannel: process.env.SLACK_DEFAULT_CHANNEL || '#general',
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
        if (rawSettings.mcp.notion.okrPageId) process.env.NOTION_OKR_PAGE_ID = rawSettings.mcp.notion.okrPageId;
        if (rawSettings.mcp.notion.retroPageId) process.env.NOTION_RETRO_PAGE_ID = rawSettings.mcp.notion.retroPageId;
        if (rawSettings.mcp.notion.sopPageId) process.env.NOTION_SOP_PAGE_ID = rawSettings.mcp.notion.sopPageId;
        if (rawSettings.mcp.notion.careerPageId) process.env.NOTION_CAREER_PAGE_ID = rawSettings.mcp.notion.careerPageId;
        if (rawSettings.mcp.notion.sprintGoalsPageId) process.env.NOTION_SPRINT_GOALS_PAGE_ID = rawSettings.mcp.notion.sprintGoalsPageId;
      }
      if (rawSettings.mcp.googleCalendar) {
        if (rawSettings.mcp.googleCalendar.apiKey) {
          process.env.GOOGLE_CALENDAR_API_KEY = rawSettings.mcp.googleCalendar.apiKey;
        }
        if (rawSettings.mcp.googleCalendar.calendarId) {
          process.env.GOOGLE_CALENDAR_ID = rawSettings.mcp.googleCalendar.calendarId;
        }
        if (rawSettings.mcp.googleCalendar.clientId) {
          process.env.GOOGLE_CLIENT_ID = rawSettings.mcp.googleCalendar.clientId;
        }
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
    this.sanitizeSettings(this.cachedRawSettings);
    const raw = this.cachedRawSettings;

    return {
      llm: {
        defaultProvider: raw.llm.defaultProvider || 'ollama',
        defaultModel: raw.llm.defaultModel || 'hermes3:8b',
        availableModels: raw.llm.availableModels || [
          'hermes3:8b',
          'qwen2.5:14b',
          'mistral-small:24b',
          'qwen2.5:32b',
          'command-r:35b',
          'llama3.3:70b',
          'gpt-oss:20b',
          'mistral:latest',
          'llama3.1:8b',
          'nomic-embed-text',
        ],
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
            redirectUrl: raw.mcp.jira?.oauth?.redirectUrl || 'http://localhost:4000/api/mcp/jira/oauth/callback',
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
          okrPageId: raw.mcp.notion?.okrPageId || '',
          retroPageId: raw.mcp.notion?.retroPageId || '',
          sopPageId: raw.mcp.notion?.sopPageId || '',
          careerPageId: raw.mcp.notion?.careerPageId || '',
          sprintGoalsPageId: raw.mcp.notion?.sprintGoalsPageId || '',
          enabled: raw.mcp.notion?.enabled ?? true,
        },
        googleCalendar: {
          apiKey: maskSecret(raw.mcp.googleCalendar?.apiKey),
          calendarId: raw.mcp.googleCalendar?.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary',
          clientId: raw.mcp.googleCalendar?.clientId || '',
          enabled: raw.mcp.googleCalendar?.enabled ?? true,
        },
        slack: {
          botToken: maskSecret(raw.mcp.slack?.botToken),
          signingSecret: maskSecret(raw.mcp.slack?.signingSecret),
          appToken: maskSecret(raw.mcp.slack?.appToken),
          defaultChannel: raw.mcp.slack?.defaultChannel || process.env.SLACK_DEFAULT_CHANNEL || '#general',
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
          redirectUrl: incoming.mcp?.jira?.oauth?.redirectUrl || current.mcp.jira?.oauth?.redirectUrl || 'http://localhost:4000/api/mcp/jira/oauth/callback',
        },
        enabled: incoming.mcp?.jira?.enabled ?? current.mcp.jira?.enabled ?? true,
      },
      github: {
        token: isMasked(incoming.mcp?.github?.token) ? current.mcp.github?.token : incoming.mcp?.github?.token ?? current.mcp.github?.token,
        owner: incoming.mcp?.github?.owner ?? current.mcp.github?.owner ?? '',
        repo: incoming.mcp?.github?.repo ?? current.mcp.github?.repo ?? '',
        enabled: incoming.mcp?.github?.enabled ?? current.mcp.github?.enabled ?? true,
      },
      notion: {
        apiKey: isMasked(incoming.mcp?.notion?.apiKey) ? current.mcp.notion?.apiKey : incoming.mcp?.notion?.apiKey ?? current.mcp.notion?.apiKey,
        mcpUrl: incoming.mcp?.notion?.mcpUrl || current.mcp.notion?.mcpUrl || '',
        okrPageId: incoming.mcp?.notion?.okrPageId ?? current.mcp.notion?.okrPageId ?? '',
        retroPageId: incoming.mcp?.notion?.retroPageId ?? current.mcp.notion?.retroPageId ?? '',
        sopPageId: incoming.mcp?.notion?.sopPageId ?? current.mcp.notion?.sopPageId ?? '',
        careerPageId: incoming.mcp?.notion?.careerPageId ?? current.mcp.notion?.careerPageId ?? '',
        sprintGoalsPageId: incoming.mcp?.notion?.sprintGoalsPageId ?? current.mcp.notion?.sprintGoalsPageId ?? '',
        enabled: incoming.mcp?.notion?.enabled ?? current.mcp.notion?.enabled ?? true,
      },
      googleCalendar: {
        apiKey: isMasked(incoming.mcp?.googleCalendar?.apiKey) ? current.mcp.googleCalendar?.apiKey : incoming.mcp?.googleCalendar?.apiKey ?? current.mcp.googleCalendar?.apiKey,
        calendarId: incoming.mcp?.googleCalendar?.calendarId || current.mcp.googleCalendar?.calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary',
        clientId: incoming.mcp?.googleCalendar?.clientId ?? current.mcp.googleCalendar?.clientId ?? '',
        enabled: incoming.mcp?.googleCalendar?.enabled ?? current.mcp.googleCalendar?.enabled ?? true,
      },
      slack: {
        botToken: isMasked(incoming.mcp?.slack?.botToken) ? current.mcp.slack?.botToken : incoming.mcp?.slack?.botToken ?? current.mcp.slack?.botToken,
        signingSecret: isMasked(incoming.mcp?.slack?.signingSecret) ? current.mcp.slack?.signingSecret : incoming.mcp?.slack?.signingSecret ?? current.mcp.slack?.signingSecret,
        appToken: isMasked(incoming.mcp?.slack?.appToken) ? current.mcp.slack?.appToken : incoming.mcp?.slack?.appToken ?? current.mcp.slack?.appToken,
        defaultChannel: incoming.mcp?.slack?.defaultChannel || current.mcp.slack?.defaultChannel || process.env.SLACK_DEFAULT_CHANNEL || '#general',
        teamId: incoming.mcp?.slack?.teamId || current.mcp.slack?.teamId || '',
        enabled: incoming.mcp?.slack?.enabled ?? current.mcp.slack?.enabled ?? true,
      },
    };

    const combined = {
      llm: updatedLlm,
      mcp: updatedMcp,
      metadata: {
        ...current.metadata,
        llmUpdatedAt: new Date().toISOString(),
        mcpUpdatedAt: new Date().toISOString(),
      },
    };
    this.sanitizeSettings(combined);
    this.cachedRawSettings = combined;

    // Save to Database
    const llmRec = await databaseService.setAppSetting('llm', updatedLlm, 'database');
    const mcpRec = await databaseService.setAppSetting('mcp', updatedMcp, 'database');

    this.cachedRawSettings = {
      llm: updatedLlm,
      mcp: updatedMcp,
      metadata: {
        llmSource: 'database',
        mcpSource: 'database',
        llmUpdatedAt: llmRec?.updated_at || new Date().toISOString(),
        mcpUpdatedAt: mcpRec?.updated_at || new Date().toISOString(),
      },
    };

    // Hot reload runtime config and reset active LLM model singleton
    this.applyToRuntimeConfig(this.cachedRawSettings);
    this.saveBackupToDisk(this.cachedRawSettings);
    resetChatModel();

    // Reset MCP cached clients so the next call picks up the new credentials
    await closeJiraMcp().catch(() => {});
    await closeNotionMcp().catch(() => {});
    await closeGithubMcp().catch(() => {});
    await closeSlackMcp().catch(() => {});
    await closeGoogleMcp().catch(() => {});

    // Invalidate multi-tier caches on credential rotation
    cacheInvalidator.invalidateAll().catch(() => {});

    info('✅ Settings saved to database and hot-reloaded into active runtime');
    return this.getMaskedSettings();
  }

  async resetToEnvDefaults() {
    this.cachedRawSettings = this.getDefaultEnvSettings();
    await databaseService.setAppSetting('llm', this.cachedRawSettings.llm, 'env_default');
    await databaseService.setAppSetting('mcp', this.cachedRawSettings.mcp, 'env_default');
    this.applyToRuntimeConfig(this.cachedRawSettings);
    resetChatModel();
    cacheInvalidator.invalidateAll().catch(() => {});
    info('🔄 Restored settings to .env defaults');
    return this.getMaskedSettings();
  }

  /**
   * Test connection to a specific provider
   */
  async testConnection(type, credentials = {}) {
    const startTime = Date.now();
    await this.initialize();
    const raw = this.cachedRawSettings;

    try {
      if (type === 'ollama') {
        let baseUrl = credentials.baseUrl || raw.llm.ollama?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        try {
          let res;
          try {
            res = await axios.get(`${baseUrl}/api/tags`, { timeout: 3500 });
          } catch (firstErr) {
            if (baseUrl.includes('localhost:11434')) {
              try {
                res = await axios.get('http://host.docker.internal:11434/api/tags', { timeout: 3500 });
                baseUrl = 'http://host.docker.internal:11434';
              } catch (_dockerErr) {
                throw firstErr;
              }
            } else {
              throw firstErr;
            }
          }
          const models = res.data?.models || [];
          return {
            success: true,
            latencyMs: Date.now() - startTime,
            message: `Connected to Ollama (${models.length} model(s) available: ${models.map((m) => m.name).slice(0, 3).join(', ')})`,
            models: models.map((m) => m.name),
          };
        } catch (err) {
          return {
            success: false,
            latencyMs: Date.now() - startTime,
            message: `Ollama is offline or unreachable at ${baseUrl}. Ensure Ollama is running ('ollama serve') or check port.`,
          };
        }
      }

      if (type === 'openai') {
        const apiKey = (isMasked(credentials.apiKey) || !credentials.apiKey)
          ? (raw.llm.openai?.apiKey || process.env.OPENAI_API_KEY)
          : credentials.apiKey;
        if (!apiKey) {
          return { success: false, latencyMs: 0, message: 'No OpenAI API Key configured' };
        }
        const baseUrl = credentials.baseUrl || raw.llm.openai?.baseUrl || 'https://api.openai.com/v1';
        try {
          await axios.get(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 4000,
          });
          return { success: true, latencyMs: Date.now() - startTime, message: 'Connected to OpenAI API' };
        } catch (err) {
          return {
            success: false,
            latencyMs: Date.now() - startTime,
            message: `OpenAI verification error (${err.response?.status || 'network'}): ${err.response?.data?.error?.message || err.message}`,
          };
        }
      }

      if (type === 'anthropic') {
        const apiKey = (isMasked(credentials.apiKey) || !credentials.apiKey)
          ? (raw.llm.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY)
          : credentials.apiKey;
        if (!apiKey) {
          return { success: false, latencyMs: 0, message: 'No Anthropic API Key configured' };
        }
        return { success: true, latencyMs: Date.now() - startTime, message: 'Anthropic credentials formatted and ready' };
      }

      if (type === 'google') {
        const apiKey = (isMasked(credentials.apiKey) || !credentials.apiKey)
          ? (raw.llm.google?.apiKey || process.env.GOOGLE_API_KEY)
          : credentials.apiKey;
        if (!apiKey) {
          return { success: false, latencyMs: 0, message: 'No Google Gemini API Key configured' };
        }
        return { success: true, latencyMs: Date.now() - startTime, message: 'Google Gemini credentials formatted and ready' };
      }

      if (type === 'jira') {
        const { jiraClient } = await import('../integrations/clients/JiraClient.js');
        const token = isMasked(credentials.apiToken)
          ? (raw.mcp.jira?.apiToken || process.env.JIRA_API_TOKEN)
          : credentials.apiToken;
        const res = await jiraClient.testConnection({ ...credentials, apiToken: token });
        return {
          success: res.success,
          latencyMs: Date.now() - startTime,
          message: res.message,
          ...res,
        };
      }

      if (type === 'github') {
        const { githubClient } = await import('../integrations/clients/GitHubClient.js');
        const token = isMasked(credentials.token)
          ? (raw.mcp.github?.token || process.env.GITHUB_TOKEN)
          : credentials.token;
        const res = await githubClient.testConnection({ ...credentials, token });
        return {
          success: res.success,
          latencyMs: Date.now() - startTime,
          message: res.message,
          ...res,
        };
      }

      if (type === 'notion') {
        const { notionClient } = await import('../integrations/clients/NotionClient.js');
        const apiKey = isMasked(credentials.apiKey)
          ? (raw.mcp.notion?.apiKey || process.env.NOTION_API_KEY)
          : credentials.apiKey;
        const res = await notionClient.testConnection({ ...credentials, apiKey });
        return {
          success: res.success,
          latencyMs: Date.now() - startTime,
          message: res.message,
          ...res,
        };
      }

      if (type === 'googleCalendar' || type === 'google_calendar') {
        const { googleCalendarClient } = await import('../integrations/clients/GoogleCalendarClient.js');
        const apiKey = isMasked(credentials.apiKey)
          ? (raw.mcp.googleCalendar?.apiKey || process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_API_KEY)
          : credentials.apiKey;
        const res = await googleCalendarClient.testConnection({ ...credentials, apiKey });
        return {
          success: res.success,
          latencyMs: Date.now() - startTime,
          message: res.message,
          ...res,
        };
      }

      if (type === 'slack') {
        const { slackClient } = await import('../integrations/clients/SlackClient.js');
        const botToken = isMasked(credentials.botToken)
          ? (raw.mcp.slack?.botToken || process.env.SLACK_BOT_TOKEN)
          : credentials.botToken;
        const res = await slackClient.testConnection({ ...credentials, botToken });
        return {
          success: res.success,
          latencyMs: Date.now() - startTime,
          message: res.message,
          ...res,
        };
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

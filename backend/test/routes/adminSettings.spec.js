import settingsService, { maskSecret, isMasked } from '../../src/services/settingsService.js';
import databaseService from '../../src/db/postgres.js';

describe('SettingsService & Admin Settings Management', () => {
  let savedEnv;

  beforeEach(async () => {
    savedEnv = { ...process.env };
    // Reset in-memory settings for clean test state
    databaseService.inMemoryAppSettings = {};
    settingsService.cachedRawSettings = null;
    settingsService.initialized = false;

    // Spy on databaseService to keep SettingsService unit tests 100% in-memory and isolated
    spyOn(databaseService, 'getAllAppSettings').and.callFake(async () => {
      const map = {};
      for (const [k, v] of Object.entries(databaseService.inMemoryAppSettings)) {
        map[k] = { value: v.value, source: v.source, updated_at: v.updated_at };
      }
      return map;
    });

    spyOn(databaseService, 'getAppSetting').and.callFake(async (key, defVal = null) => {
      const found = databaseService.inMemoryAppSettings[key];
      return found || (defVal != null ? { key, value: defVal, source: 'default' } : null);
    });

    spyOn(databaseService, 'setAppSetting').and.callFake(async (key, value, source = 'database') => {
      const record = { key, value, source, updated_at: new Date().toISOString() };
      databaseService.inMemoryAppSettings[key] = record;
      return record;
    });
  });

  afterEach(async () => {
    databaseService.inMemoryAppSettings = {};
    settingsService.cachedRawSettings = null;
    settingsService.initialized = false;
    process.env = savedEnv;
  });

  describe('Secret Masking & Detection Utilities', () => {
    it('should mask GitHub personal access tokens correctly', () => {
      const masked = maskSecret('ghp_abcdef1234567890XYZ');
      expect(masked).toBe('ghp_******0XYZ');
      expect(isMasked(masked)).toBe(true);
    });

    it('should mask Notion internal integration secrets correctly', () => {
      const masked = maskSecret('secret_abcdef1234567890XYZ');
      expect(masked).toBe('secret_******0XYZ');
      expect(isMasked(masked)).toBe(true);
    });

    it('should mask general long tokens correctly', () => {
      const masked = maskSecret('mySuperSecretToken123456');
      expect(masked).toContain('******');
      expect(isMasked(masked)).toBe(true);
    });

    it('should identify unmasked plaintext strings as not masked', () => {
      expect(isMasked('ghp_validplaintexttoken1234')).toBe(false);
      expect(isMasked('https://company.atlassian.net')).toBe(false);
    });
  });

  describe('Auto-Migration & Database Seeding', () => {
    it('should auto-migrate and seed settings from env when DB is empty', async () => {
      const masked = await settingsService.getMaskedSettings();
      expect(masked).toBeDefined();
      expect(masked.llm).toBeDefined();
      expect(masked.mcp).toBeDefined();
      expect(masked.metadata.llmSource).toBe('migrated_env');
      expect(masked.metadata.mcpSource).toBe('migrated_env');
    });

    it('should update settings and persist with database source', async () => {
      const updated = await settingsService.updateSettings({
        llm: {
          defaultProvider: 'ollama',
          defaultModel: 'mistral:latest',
          temperature: 0.15,
        },
        mcp: {
          jira: {
            url: 'https://testcompany.atlassian.net',
            email: 'admin.lead@myenterprise.internal',
            apiToken: 'test_token_12345678',
          },
        },
      });

      expect(updated.llm.defaultModel).toBe('mistral:latest');
      expect(updated.llm.temperature).toBe(0.15);
      expect(updated.mcp.jira.url).toBe('https://testcompany.atlassian.net');
      expect(updated.mcp.jira.email).toBe('admin.lead@myenterprise.internal');
      expect(updated.metadata.llmSource).toBe('database');
    });

    it('should preserve existing secret when receiving masked value on update', async () => {
      // First, set a known plaintext secret
      await settingsService.updateSettings({
        mcp: {
          github: {
            token: 'ghp_OriginalSecretValue9999',
            owner: 'myorg',
            repo: 'myrepo',
          },
        },
      });

      // Fetch masked settings
      const masked = await settingsService.getMaskedSettings();
      expect(masked.mcp.github.token).toContain('******');

      // Update non-secret field while sending the masked token back
      const secondUpdate = await settingsService.updateSettings({
        mcp: {
          github: {
            token: masked.mcp.github.token, // send back masked value
            owner: 'myorg-updated',
            repo: 'myrepo-updated',
          },
        },
      });

      expect(secondUpdate.mcp.github.owner).toBe('myorg-updated');
      // The underlying stored raw token must remain the original secret
      expect(settingsService.cachedRawSettings.mcp.github.token).toBe('ghp_OriginalSecretValue9999');
    });

    it('should reset settings to .env defaults', async () => {
      // Customize first
      await settingsService.updateSettings({
        llm: { defaultModel: 'custom-model:3b' },
      });

      // Reset
      const reset = await settingsService.resetToEnvDefaults();
      expect(reset.metadata.llmSource).toBe('migrated_env');
    });
  });

  describe('Live Connection Testing', () => {
    it('should reject invalid Jira URL', async () => {
      const res = await settingsService.testConnection('jira', { url: 'invalid-url' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('Invalid Jira URL');
    });

    it('should report failure for unconfigured GitHub token', async () => {
      const res = await settingsService.testConnection('github', { token: '' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('No GitHub Personal Access Token');
    });

    it('should report failure for unconfigured Notion key', async () => {
      const res = await settingsService.testConnection('notion', { apiKey: '' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('No Notion API Key');
    });

    it('should report failure for unconfigured Google Calendar key', async () => {
      const res = await settingsService.testConnection('googleCalendar', { apiKey: '' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('No Google Calendar API Key');
    });

    it('should handle unknown connection type', async () => {
      const res = await settingsService.testConnection('unknown_service');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Unknown connection test type');
    });
  });
});

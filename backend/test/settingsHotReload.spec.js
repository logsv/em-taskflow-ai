import settingsService from '../src/services/settingsService.js';
import { getChatModel, resetChatModel } from '../src/llm/index.js';
import { config } from '../src/config.js';
import databaseService from '../src/db/postgres.js';

describe('SettingsService & LLM Model Hot-Reload Contract', () => {
  let initialModel;

  beforeAll(async () => {
    initialModel = config.llm.defaultModel || 'hermes3:8b';
  });

  afterEach(async () => {
    // Restore baseline model
    config.llm.defaultModel = initialModel;
    resetChatModel();
    databaseService.inMemoryAppSettings = {};
    settingsService.cachedRawSettings = null;
    settingsService.initialized = false;
  });

  it('should dynamically hot-reload model into getChatModel when settings are updated', async () => {
    // 1. Initial state
    resetChatModel();
    const initialLLM = getChatModel();
    expect(initialLLM.modelName || initialLLM.model).toBeDefined();

    // 2. Simulate database settings update with >12B model
    spyOn(databaseService, 'setAppSetting').and.callFake(async (key, val, src) => ({
      key,
      value: val,
      source: src,
      updated_at: new Date().toISOString(),
    }));

    await settingsService.updateSettings({
      llm: {
        defaultModel: 'qwen2.5:14b',
        defaultProvider: 'ollama',
      },
    });

    // 3. Verify runtime config updated
    expect(config.llm.defaultModel).toBe('qwen2.5:14b');

    // 4. Verify getChatModel immediately yields the updated model without restart
    const updatedLLM = getChatModel();
    expect(updatedLLM.modelName || updatedLLM.model).toBe('qwen2.5:14b');
  });

  it('should support switching across different model families seamlessly', async () => {
    spyOn(databaseService, 'setAppSetting').and.callFake(async (key, val, src) => ({
      key,
      value: val,
      source: src,
      updated_at: new Date().toISOString(),
    }));

    // Test mistral-small:24b
    await settingsService.updateSettings({
      llm: { defaultModel: 'mistral-small:24b' },
    });
    expect(config.llm.defaultModel).toBe('mistral-small:24b');
    let llm = getChatModel();
    expect(llm.modelName || llm.model).toBe('mistral-small:24b');

    // Test command-r:35b
    await settingsService.updateSettings({
      llm: { defaultModel: 'command-r:35b' },
    });
    expect(config.llm.defaultModel).toBe('command-r:35b');
    llm = getChatModel();
    expect(llm.modelName || llm.model).toBe('command-r:35b');
  });

  it('should restore initial defaults on resetToEnvDefaults()', async () => {
    spyOn(databaseService, 'setAppSetting').and.callFake(async (key, val, src) => ({
      key,
      value: val,
      source: src,
      updated_at: new Date().toISOString(),
    }));

    await settingsService.updateSettings({
      llm: { defaultModel: 'llama3.3:70b' },
    });
    expect(config.llm.defaultModel).toBe('llama3.3:70b');

    await settingsService.resetToEnvDefaults();
    expect(config.llm.defaultModel).toBe('hermes3:8b');
    const restoredLLM = getChatModel();
    expect(restoredLLM.modelName || restoredLLM.model).toBe('hermes3:8b');
  });

  it('should hot-reload GitHub, Jira, and Notion target configuration settings dynamically', async () => {
    spyOn(databaseService, 'setAppSetting').and.callFake(async (key, val, src) => ({
      key,
      value: val,
      source: src,
      updated_at: new Date().toISOString(),
    }));

    await settingsService.updateSettings({
      mcp: {
        github: {
          owner: 'acme-corp',
          repo: 'enterprise-core',
          token: 'ghp_dynamic_test_secret_123',
        },
        jira: {
          url: 'https://acme-corp.atlassian.net',
          projectKey: 'ACME',
          email: 'admin@acme.corp',
        },
        notion: {
          apiKey: 'ntn_test_secret_456',
          okrPageId: 'page_okr_999',
          retroPageId: 'page_retro_888',
          sopPageId: 'page_sop_777',
          careerPageId: 'page_career_666',
        },
      },
    });

    const cached = settingsService.getCachedSettings();
    expect(cached.mcp.github.owner).toBe('acme-corp');
    expect(cached.mcp.github.repo).toBe('enterprise-core');
    expect(cached.mcp.jira.projectKey).toBe('ACME');
    expect(cached.mcp.notion.okrPageId).toBe('page_okr_999');
    expect(cached.mcp.notion.retroPageId).toBe('page_retro_888');
    expect(cached.mcp.notion.sopPageId).toBe('page_sop_777');
    expect(cached.mcp.notion.careerPageId).toBe('page_career_666');

    // Verify masked settings mask sensitive tokens while exposing page IDs and repos
    const masked = await settingsService.getMaskedSettings();
    expect(masked.mcp.github.owner).toBe('acme-corp');
    expect(masked.mcp.github.repo).toBe('enterprise-core');
    expect(masked.mcp.github.token).toContain('******');
    expect(masked.mcp.notion.apiKey).toContain('******');
    expect(masked.mcp.notion.okrPageId).toBe('page_okr_999');
  });
});

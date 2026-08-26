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
});

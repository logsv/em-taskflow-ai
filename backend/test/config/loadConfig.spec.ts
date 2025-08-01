/// <reference path="../types.d.ts" />

import sinon from 'sinon';
import fs from 'fs';
import * as yaml from 'js-yaml';
import { loadConfig } from '../../src/config/loadConfig.js';
import type { RouterConfig } from '../../src/types/config.js';

describe('loadConfig', () => {
  let sandbox: sinon.SinonSandbox;
  let consoleWarnStub: sinon.SinonStub;
  let fsReadFileSyncStub: sinon.SinonStub;
  let yamlLoadStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    consoleWarnStub = sandbox.stub(console, 'warn');
    fsReadFileSyncStub = sandbox.stub(fs, 'readFileSync');
    yamlLoadStub = sandbox.stub(yaml, 'load');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('YAML configuration loading', () => {
    it('should load valid YAML configuration', async () => {
      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    priority: 1
    apiKey: test-key
    models:
      - name: gpt-3.5-turbo
        costPer1kInputTokens: 0.0015
        costPer1kOutputTokens: 0.002
        maxTokens: 4096
`;

      const expectedConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            priority: 1,
            apiKey: 'test-key',
            models: [
              {
                name: 'gpt-3.5-turbo',
                costPer1kInputTokens: 0.0015,
                costPer1kOutputTokens: 0.002,
                maxTokens: 4096
              }
            ]
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(expectedConfig);

      const config = await loadConfig('test-config.yaml');

      expect(config.loadBalancingStrategy).toBe('round_robin');
      expect(config.defaultModel).toBe('gpt-3.5-turbo');
      expect(config.providers).toBeDefined();
      expect(config.providers.length).toBe(1);
      expect(config.providers[0].name).toBe('openai-test');
      expect(fsReadFileSyncStub.calledWith('test-config.yaml', 'utf8')).toBe(true);
      expect(yamlLoadStub.calledWith(yamlContent)).toBe(true);
    });

    it('should use default config path when none provided', async () => {
      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers: []
`;

      const expectedConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: []
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(expectedConfig);

      const config = await loadConfig();

      expect(config).toBeDefined();
      expect(fsReadFileSyncStub.calledWith(sinon.match(/config\/llm-router\.yaml$/), 'utf8')).toBe(true);
    });

    it('should handle missing configuration file', async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      fsReadFileSyncStub.throws(error);

      const config = await loadConfig('missing-config.yaml');

      expect(config.loadBalancingStrategy).toBe('round_robin');
      expect(config.defaultModel).toBe('gpt-3.5-turbo');
      expect(config.providers).toEqual([]);
      expect(consoleWarnStub.calledWith(sinon.match(/Configuration file not found/))).toBe(true);
    });

    it('should throw error for invalid YAML', async () => {
      const invalidYaml = 'invalid: yaml: content: [';
      fsReadFileSyncStub.returns(invalidYaml);
      yamlLoadStub.throws(new Error('Invalid YAML'));

      try {
        await loadConfig('invalid-config.yaml');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Failed to load configuration file');
      }
    });
  });

  describe('Environment variable overrides', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = process.env;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should override provider API key from environment', async () => {
      process.env = {
        ...originalEnv,
        LLM_OPENAI_TEST_API_KEY: 'env-override-key'
      };

      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    apiKey: original-key
    models: []
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            apiKey: 'original-key',
            models: []
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      const config = await loadConfig();

      expect(config.providers[0].apiKey).toBe('env-override-key');
    });

    it('should override provider enabled status from environment', async () => {
      process.env = {
        ...originalEnv,
        LLM_OPENAI_TEST_ENABLED: 'false'
      };

      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    models: []
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            models: []
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      const config = await loadConfig();

      expect(config.providers[0].enabled).toBe(false);
    });

    it('should override circuit breaker settings from environment', async () => {
      process.env = {
        ...originalEnv,
        LLM_OPENAI_TEST_CB_FAILURE_THRESHOLD: '10',
        LLM_OPENAI_TEST_CB_SUCCESS_THRESHOLD: '5',
        LLM_OPENAI_TEST_CB_TIMEOUT_MS: '120000'
      };

      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    models: []
    circuitBreaker:
      failureThreshold: 3
      successThreshold: 2
      timeout: 60000
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            models: [],
            circuitBreaker: {
              failureThreshold: 3,
              successThreshold: 2,
              timeout: 60000
            }
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      const config = await loadConfig();

      expect(config.providers[0].circuitBreaker?.failureThreshold).toBe(10);
      expect(config.providers[0].circuitBreaker?.successThreshold).toBe(5);
      expect(config.providers[0].circuitBreaker?.timeout).toBe(120000);
    });

    it('should override retry settings from environment', async () => {
      process.env = {
        ...originalEnv,
        LLM_OPENAI_TEST_RETRY_ATTEMPTS: '5',
        LLM_OPENAI_TEST_RETRY_DELAY_MS: '2000',
        LLM_OPENAI_TEST_RETRY_MAX_DELAY_MS: '60000',
        LLM_OPENAI_TEST_RETRY_FACTOR: '3'
      };

      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    models: []
    retry:
      maxAttempts: 3
      initialDelay: 1000
      maxDelay: 30000
      factor: 2
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            models: [],
            retry: {
              maxAttempts: 3,
              initialDelay: 1000,
              maxDelay: 30000,
              factor: 2
            }
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      const config = await loadConfig();

      expect(config.providers[0].retry?.maxAttempts).toBe(5);
      expect(config.providers[0].retry?.initialDelay).toBe(2000);
      expect(config.providers[0].retry?.maxDelay).toBe(60000);
      expect(config.providers[0].retry?.factor).toBe(3);
    });
  });

  describe('Configuration validation', () => {
    it('should throw error when no providers are configured', async () => {
      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers: []
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: []
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      try {
        await loadConfig();
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('No LLM providers configured');
      }
    });

    it('should throw error when provider name is missing', async () => {
      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - type: openai
    enabled: true
    models: []
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            type: 'openai',
            enabled: true,
            models: []
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      try {
        await loadConfig();
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('Provider name is required');
      }
    });

    it('should throw error when API key is missing for external providers', async () => {
      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    models: []
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            models: []
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      try {
        await loadConfig();
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('API key is required for provider openai-test');
      }
    });

    it('should warn when default model is not found in providers', async () => {
      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-4
providers:
  - name: openai-test
    type: openai
    enabled: true
    apiKey: test-key
    models:
      - name: gpt-3.5-turbo
        costPer1kInputTokens: 0.0015
        costPer1kOutputTokens: 0.002
        maxTokens: 4096
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-4',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            apiKey: 'test-key',
            models: [
              {
                name: 'gpt-3.5-turbo',
                costPer1kInputTokens: 0.0015,
                costPer1kOutputTokens: 0.002,
                maxTokens: 4096
              }
            ]
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      const config = await loadConfig();

      expect(config.defaultModel).toBe('gpt-4');
      expect(consoleWarnStub.calledWith('Default model gpt-4 not found in any provider')).toBe(true);
    });

    it('should set default models when none provided', async () => {
      const yamlContent = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    apiKey: test-key
`;

      const yamlConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            apiKey: 'test-key'
          }
        ]
      };

      fsReadFileSyncStub.returns(yamlContent);
      yamlLoadStub.returns(yamlConfig);

      const config = await loadConfig();

      expect(config.providers[0].models).toBeDefined();
      expect(config.providers[0].models!.length).toBe(1);
      expect(config.providers[0].models![0].name).toBe('default');
      expect(config.providers[0].models![0].costPer1kInputTokens).toBe(0.01);
      expect(config.providers[0].models![0].costPer1kOutputTokens).toBe(0.03);
      expect(config.providers[0].models![0].maxTokens).toBe(4096);
    });
  });
});
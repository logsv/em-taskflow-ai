/// <reference path="../types.d.ts" />

import sinon from 'sinon';
import { LLMRouter, type LLMRequest, type LLMResponse } from '../../src/services/llmRouter.js';
import type { RouterConfig } from '../../src/types/config.js';

describe('LLMRouter', () => {
  let sandbox: sinon.SinonSandbox;
  let consoleLogStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;
  let consoleWarnStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    consoleLogStub = sandbox.stub(console, 'log');
    consoleErrorStub = sandbox.stub(console, 'error');
    consoleWarnStub = sandbox.stub(console, 'warn');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('create', () => {
    it('should create LLMRouter instance with valid configuration', async () => {
      // Mock the loadConfig module
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-test',
            type: 'openai',
            enabled: true,
            priority: 1,
            apiKey: 'test-key',
            baseUrl: 'https://api.openai.com/v1',
            models: [
              {
                name: 'gpt-3.5-turbo',
                costPer1kInputTokens: 0.0015,
                costPer1kOutputTokens: 0.002,
                maxTokens: 4096
              }
            ],
            circuitBreaker: {
              failureThreshold: 5,
              successThreshold: 3,
              timeout: 60000
            },
            retry: {
              maxAttempts: 3,
              initialDelay: 1000,
              maxDelay: 30000,
              factor: 2
            }
          }
        ]
      };

      const mockProvider = {
        name: 'openai-test',
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub.returns(mockProvider);

      const router = await LLMRouter.create();

      expect(router).toBeInstanceOf(LLMRouter);
      expect(loadConfigStub.calledWith(undefined)).toBe(true);
      expect(createProviderStub.calledWith({
        name: 'openai-test',
        type: 'openai',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1'
      })).toBe(true);
      expect(consoleLogStub.calledWith('Initialized provider: openai-test (openai)')).toBe(true);
    });

    it('should throw error when no providers are configured', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: []
      };

      loadConfigStub.resolves(mockConfig);

      try {
        await LLMRouter.create();
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('No LLM providers configured');
      }
    });

    it('should skip disabled providers', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'disabled-provider',
            type: 'openai',
            enabled: false,
            priority: 1,
            apiKey: 'test-key',
            models: []
          },
          {
            name: 'enabled-provider',
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

      const mockProvider = {
        name: 'enabled-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub.returns(mockProvider);

      const router = await LLMRouter.create();

      expect(router).toBeInstanceOf(LLMRouter);
      expect(createProviderStub.calledOnce).toBe(true);
      expect(createProviderStub.calledWith({
        name: 'enabled-provider',
        type: 'openai',
        apiKey: 'test-key',
        baseUrl: ''
      })).toBe(true);
    });

    it('should handle provider initialization errors gracefully', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'failing-provider',
            type: 'openai',
            enabled: true,
            priority: 1,
            apiKey: 'test-key',
            models: []
          },
          {
            name: 'working-provider',
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

      const mockProvider = {
        name: 'working-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub
        .onFirstCall().throws(new Error('Provider initialization failed'))
        .onSecondCall().returns(mockProvider);

      const router = await LLMRouter.create();

      expect(router).toBeInstanceOf(LLMRouter);
      expect(consoleErrorStub.calledWith('Failed to initialize provider failing-provider:', sinon.match.any)).toBe(true);
      expect(consoleLogStub.calledWith('Initialized provider: working-provider (openai)')).toBe(true);
    });

    it('should throw error when no providers can be initialized', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'failing-provider',
            type: 'openai',
            enabled: true,
            priority: 1,
            apiKey: 'test-key',
            models: []
          }
        ]
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub.throws(new Error('Provider initialization failed'));

      try {
        await LLMRouter.create();
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('No LLM providers could be initialized');
      }
    });
  });

  describe('execute', () => {
    let router: LLMRouter;
    let mockProvider: any;
    let loadConfigStub: sinon.SinonStub;
    let createProviderStub: sinon.SinonStub;

    beforeEach(async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'test-provider',
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

      mockProvider = {
        name: 'test-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub.returns(mockProvider);

      router = await LLMRouter.create();
    });

    it('should execute request successfully', async () => {
      const mockResponse: LLMResponse = {
        text: 'Test response',
        model: 'gpt-3.5-turbo',
        provider: 'test-provider',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15
        }
      };

      mockProvider.createCompletion.resolves(mockResponse);

      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo'
      };

      const result = await router.execute(request);

      expect(result).toEqual(mockResponse);
      expect(mockProvider.createCompletion.calledWith(request)).toBe(true);
    });

    it('should use default model when not specified', async () => {
      const mockResponse: LLMResponse = {
        text: 'Test response',
        model: 'gpt-3.5-turbo',
        provider: 'test-provider'
      };

      mockProvider.createCompletion.resolves(mockResponse);

      const request: LLMRequest = {
        prompt: 'Test prompt'
      };

      const result = await router.execute(request);

      expect(result).toEqual(mockResponse);
      expect(mockProvider.createCompletion.calledWith({
        ...request,
        model: 'gpt-3.5-turbo'
      })).toBe(true);
    });

    it('should throw error when no model specified and no default', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const tempLoadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const tempCreateProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        providers: [
          {
            name: 'test-provider',
            type: 'openai',
            enabled: true,
            priority: 1,
            apiKey: 'test-key',
            models: []
          }
        ]
      };

      tempLoadConfigStub.resolves(mockConfig);
      tempCreateProviderStub.returns(mockProvider);
      
      const routerWithoutDefault = await LLMRouter.create();

      const request: LLMRequest = {
        prompt: 'Test prompt'
      };

      try {
        await routerWithoutDefault.execute(request);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('No model specified in request and no default model configured');
      }
    });

    it('should throw error when no providers support the requested model', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'unsupported-model'
      };

      try {
        await router.execute(request);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('No providers available for model: unsupported-model');
      }
    });
  });

  describe('getProviderStatus', () => {
    let router: LLMRouter;

    beforeEach(async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'test-provider',
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

      const mockProvider = {
        name: 'test-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub.returns(mockProvider);

      router = await LLMRouter.create();
    });

    it('should return provider status', () => {
      const status = router.getProviderStatus('test-provider');

      expect(status).toBeDefined();
      expect(status?.name).toBe('test-provider');
      expect(status?.type).toBe('openai');
      expect(status?.enabled).toBe(true);
      expect(status?.lastUsed).toBe(0);
      expect(status?.failureCount).toBe(0);
      expect(status?.successCount).toBe(0);
      expect(status?.circuitBreaker).toBeDefined();
      expect(status?.rateLimiter).toBeDefined();
    });

    it('should return null for non-existent provider', () => {
      const status = router.getProviderStatus('non-existent');
      expect(status).toBeNull();
    });
  });

  describe('updateProviderConfig', () => {
    let router: LLMRouter;

    beforeEach(async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'test-provider',
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

      const mockProvider = {
        name: 'test-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub.returns(mockProvider);

      router = await LLMRouter.create();
    });

    it('should update provider configuration', () => {
      const updates = {
        enabled: false,
        priority: 5,
        circuitBreaker: {
          failureThreshold: 10
        }
      };

      router.updateProviderConfig('test-provider', updates);

      const status = router.getProviderStatus('test-provider');
      expect(status?.enabled).toBe(false);
    });

    it('should throw error for non-existent provider', () => {
      expect(() => {
        router.updateProviderConfig('non-existent', { enabled: false });
      }).toThrow('Provider non-existent not found');
    });
  });
});
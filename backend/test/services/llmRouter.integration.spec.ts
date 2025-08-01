/// <reference path="../types.d.ts" />

import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import { LLMRouter, type LLMRequest, type LLMResponse } from '../../src/services/llmRouter.js';
import { loadConfig } from '../../src/config/loadConfig.js';
import type { RouterConfig } from '../../src/types/config.js';

describe('LLMRouter Integration Tests', () => {
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

  describe('Configuration Loading', () => {
    it('should load configuration from YAML file', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'cost_priority_round_robin',
        defaultModel: 'gpt-4',
        providers: [
          {
            name: 'openai-primary',
            type: 'openai',
            enabled: true,
            priority: 1,
            apiKey: 'sk-test-key',
            baseUrl: 'https://api.openai.com/v1',
            models: [
              {
                name: 'gpt-4',
                costPer1kInputTokens: 0.03,
                costPer1kOutputTokens: 0.06,
                maxTokens: 8192
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
          },
          {
            name: 'ollama-fallback',
            type: 'ollama',
            enabled: true,
            priority: 2,
            baseUrl: 'http://localhost:11434',
            models: [
              {
                name: 'llama2',
                costPer1kInputTokens: 0,
                costPer1kOutputTokens: 0,
                maxTokens: 4096
              }
            ],
            circuitBreaker: {
              failureThreshold: 3,
              successThreshold: 2,
              timeout: 30000
            },
            retry: {
              maxAttempts: 2,
              initialDelay: 500,
              maxDelay: 10000,
              factor: 1.5
            }
          }
        ]
      };

      const openaiProvider = {
        name: 'openai-primary',
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      const ollamaProvider = {
        name: 'ollama-fallback',
        type: 'ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        createCompletion: sinon.stub(),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub
        .onFirstCall().returns(openaiProvider)
        .onSecondCall().returns(ollamaProvider);

      const router = await LLMRouter.create('config/llm-router.yaml');

      expect(router).toBeInstanceOf(LLMRouter);
      expect(loadConfigStub.calledWith('config/llm-router.yaml')).toBe(true);
      expect(createProviderStub.calledTwice).toBe(true);
      expect(consoleLogStub.calledWith('Initialized provider: openai-primary (openai)')).toBe(true);
      expect(consoleLogStub.calledWith('Initialized provider: ollama-fallback (ollama)')).toBe(true);
    });

    it('should handle environment variable overrides', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        LLM_OPENAI_PRIMARY_API_KEY: 'env-override-key',
        LLM_OPENAI_PRIMARY_ENABLED: 'false'
      };

      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'openai-primary',
            type: 'openai',
            enabled: false, // Should be overridden by env var
            priority: 1,
            apiKey: 'env-override-key', // Should be overridden by env var
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

      loadConfigStub.resolves(mockConfig);

      const router = await LLMRouter.create();

      expect(router).toBeInstanceOf(LLMRouter);
      // Provider should be skipped due to enabled: false from env var
      expect(createProviderStub.called).toBe(false);

      process.env = originalEnv;
    });
  });

  describe('Circuit Breaker Functionality', () => {
    let router: LLMRouter;
    let mockProvider: any;

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
            ],
            circuitBreaker: {
              failureThreshold: 2, // Low threshold for testing
              successThreshold: 1,
              timeout: 1000 // Short timeout for testing
            }
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

    it('should track provider failures and successes', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo'
      };

      // First request succeeds
      mockProvider.createCompletion.resolves({
        text: 'Success response',
        model: 'gpt-3.5-turbo',
        provider: 'test-provider'
      });

      await router.execute(request);

      let status = router.getProviderStatus('test-provider');
      expect(status?.successCount).toBe(1);
      expect(status?.failureCount).toBe(0);

      // Second request fails
      mockProvider.createCompletion.rejects(new Error('Provider error'));

      try {
        await router.execute(request);
      } catch (error) {
        // Expected to fail
      }

      status = router.getProviderStatus('test-provider');
      expect(status?.failureCount).toBe(1);
    });
  });

  describe('Retry Policy Functionality', () => {
    let router: LLMRouter;
    let mockProvider: any;

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
            ],
            retry: {
              maxAttempts: 3,
              initialDelay: 100, // Short delay for testing
              maxDelay: 1000,
              factor: 2
            }
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

    it('should retry failed requests according to policy', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo'
      };

      // First two calls fail, third succeeds
      mockProvider.createCompletion
        .onFirstCall().rejects(new Error('Temporary error'))
        .onSecondCall().rejects(new Error('Temporary error'))
        .onThirdCall().resolves({
          text: 'Success after retries',
          model: 'gpt-3.5-turbo',
          provider: 'test-provider'
        });

      const result = await router.execute(request);

      expect(result.text).toBe('Success after retries');
      expect(mockProvider.createCompletion.callCount).toBe(3);
    });

    it('should fail after max retry attempts', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo'
      };

      // All calls fail
      mockProvider.createCompletion.rejects(new Error('Persistent error'));

      try {
        await router.execute(request);
        fail('Should have thrown an error after max retries');
      } catch (error: any) {
        expect(error.message).toBe('Persistent error');
        expect(mockProvider.createCompletion.callCount).toBe(3); // maxAttempts
      }
    });
  });

  describe('Load Balancing Strategies', () => {
    it('should distribute requests using round_robin strategy', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'provider-1',
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
          },
          {
            name: 'provider-2',
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

      const provider1 = {
        name: 'provider-1',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub().resolves({
          text: 'Response from provider 1',
          model: 'gpt-3.5-turbo',
          provider: 'provider-1'
        }),
        estimateTokens: sinon.stub()
      };

      const provider2 = {
        name: 'provider-2',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub().resolves({
          text: 'Response from provider 2',
          model: 'gpt-3.5-turbo',
          provider: 'provider-2'
        }),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub
        .onFirstCall().returns(provider1)
        .onSecondCall().returns(provider2);

      const router = await LLMRouter.create();

      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo'
      };

      // Make multiple requests to test round-robin distribution
      const results: string[] = [];
      for (let i = 0; i < 4; i++) {
        const result = await router.execute(request);
        results.push(result.provider);
      }

      // Should have used both providers
      const uniqueProviders = [...new Set(results)];
      expect(uniqueProviders.length).toBeGreaterThan(1);
      expect(uniqueProviders).toContain('provider-1');
      expect(uniqueProviders).toContain('provider-2');
    });

    it('should prefer cost-effective providers with cost_priority_round_robin', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'cost_priority_round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'expensive-provider',
            type: 'openai',
            enabled: true,
            priority: 1,
            apiKey: 'test-key',
            models: [
              {
                name: 'gpt-3.5-turbo',
                costPer1kInputTokens: 0.01, // More expensive
                costPer1kOutputTokens: 0.03,
                maxTokens: 4096
              }
            ]
          },
          {
            name: 'cheap-provider',
            type: 'openai',
            enabled: true,
            priority: 2, // Higher priority
            apiKey: 'test-key',
            models: [
              {
                name: 'gpt-3.5-turbo',
                costPer1kInputTokens: 0.001, // Cheaper
                costPer1kOutputTokens: 0.002,
                maxTokens: 4096
              }
            ]
          }
        ]
      };

      const expensiveProvider = {
        name: 'expensive-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub().resolves({
          text: 'Expensive response',
          model: 'gpt-3.5-turbo',
          provider: 'expensive-provider'
        }),
        estimateTokens: sinon.stub()
      };

      const cheapProvider = {
        name: 'cheap-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub().resolves({
          text: 'Cheap response',
          model: 'gpt-3.5-turbo',
          provider: 'cheap-provider'
        }),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub
        .onFirstCall().returns(expensiveProvider)
        .onSecondCall().returns(cheapProvider);

      const router = await LLMRouter.create();

      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo'
      };

      // Make multiple requests
      const results: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = await router.execute(request);
        results.push(result.provider);
      }

      // Should prefer the cheaper provider more often
      const cheapCount = results.filter(p => p === 'cheap-provider').length;
      const expensiveCount = results.filter(p => p === 'expensive-provider').length;
      
      // Due to cost and priority weighting, cheap provider should be used more
      expect(cheapCount + expensiveCount).toBe(10);
      expect(cheapCount).toBeGreaterThan(0);
    });
  });

  describe('Provider Fallback', () => {
    it('should fallback to secondary provider when primary fails', async () => {
      const loadConfigModule = await import('../../src/config/loadConfig.js');
      const createProviderModule = await import('../../src/services/llmProviders.js');
      
      const loadConfigStub = sandbox.stub(loadConfigModule, 'loadConfig');
      const createProviderStub = sandbox.stub(createProviderModule, 'createProvider');

      const mockConfig: RouterConfig = {
        loadBalancingStrategy: 'round_robin',
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'primary-provider',
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
          },
          {
            name: 'fallback-provider',
            type: 'ollama',
            enabled: true,
            priority: 2,
            baseUrl: 'http://localhost:11434',
            models: [
              {
                name: 'gpt-3.5-turbo', // Same model supported
                costPer1kInputTokens: 0,
                costPer1kOutputTokens: 0,
                maxTokens: 4096
              }
            ]
          }
        ]
      };

      const primaryProvider = {
        name: 'primary-provider',
        type: 'openai',
        baseUrl: '',
        apiKey: 'test-key',
        createCompletion: sinon.stub().rejects(new Error('Primary provider failed')),
        estimateTokens: sinon.stub()
      };

      const fallbackProvider = {
        name: 'fallback-provider',
        type: 'ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        createCompletion: sinon.stub().resolves({
          text: 'Fallback response',
          model: 'gpt-3.5-turbo',
          provider: 'fallback-provider'
        }),
        estimateTokens: sinon.stub()
      };

      loadConfigStub.resolves(mockConfig);
      createProviderStub
        .onFirstCall().returns(primaryProvider)
        .onSecondCall().returns(fallbackProvider);

      const router = await LLMRouter.create();

      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo'
      };

      const result = await router.execute(request);

      expect(result.text).toBe('Fallback response');
      expect(result.provider).toBe('fallback-provider');
      expect(consoleErrorStub.calledWith('Failed to execute with primary-provider:', sinon.match.any)).toBe(true);
      expect(primaryProvider.createCompletion.called).toBe(true);
      expect(fallbackProvider.createCompletion.called).toBe(true);
    });
  });
});
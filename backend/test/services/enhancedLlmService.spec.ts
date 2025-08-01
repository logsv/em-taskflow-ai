/// <reference path="../types.d.ts" />

import sinon from 'sinon';
import { EnhancedLLMService, __test__ } from '../../src/services/enhancedLlmService.js';
import { LLMRouter } from '../../src/services/llmRouter.js';

describe('EnhancedLLMService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: EnhancedLLMService;
  let mockRouter: any;
  let consoleLogStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    service = new EnhancedLLMService();
    consoleLogStub = sandbox.stub(console, 'log');
    consoleErrorStub = sandbox.stub(console, 'error');

    // Mock LLMRouter
    mockRouter = {
      execute: sinon.stub(),
      getProviderStatus: sinon.stub(),
      updateProviderConfig: sinon.stub()
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const createStub = sandbox.stub(LLMRouter, 'create').resolves(mockRouter);

      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(createStub.calledWith(undefined)).toBe(true);
      expect(consoleLogStub.calledWith('🚀 Initializing Enhanced LLM Service with router...')).toBe(true);
      expect(consoleLogStub.calledWith('✅ Enhanced LLM Service initialized successfully')).toBe(true);
    });

    it('should initialize with custom config path', async () => {
      const createStub = sandbox.stub(LLMRouter, 'create').resolves(mockRouter);

      await service.initialize('custom-config.yaml');

      expect(service.isInitialized()).toBe(true);
      expect(createStub.calledWith('custom-config.yaml')).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Router initialization failed');
      sandbox.stub(LLMRouter, 'create').rejects(error);

      try {
        await service.initialize();
        fail('Should have thrown an error');
      } catch (thrownError) {
        expect(thrownError).toBe(error);
        expect(service.isInitialized()).toBe(false);
        expect(consoleErrorStub.calledWith('❌ Failed to initialize Enhanced LLM Service:', error)).toBe(true);
      }
    });

    it('should not be initialized by default', () => {
      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('complete', () => {
    beforeEach(async () => {
      sandbox.stub(LLMRouter, 'create').resolves(mockRouter);
      await service.initialize();
    });

    it('should complete text successfully', async () => {
      const mockResponse = {
        text: 'Test response',
        model: 'gpt-3.5-turbo',
        provider: 'openai'
      };

      mockRouter.execute.resolves(mockResponse);

      const result = await service.complete('Test prompt');

      expect(result).toBe('Test response');
      expect(mockRouter.execute.calledWith({
        prompt: 'Test prompt',
        model: undefined,
        temperature: undefined,
        maxTokens: undefined,
        topP: undefined,
        frequencyPenalty: undefined,
        presencePenalty: undefined,
        stop: undefined
      }, undefined)).toBe(true);
    });

    it('should complete text with options', async () => {
      const mockResponse = {
        text: 'Test response with options',
        model: 'gpt-4',
        provider: 'openai'
      };

      mockRouter.execute.resolves(mockResponse);

      const options = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        stop: ['END'],
        preferredProviders: ['openai']
      };

      const result = await service.complete('Test prompt', options);

      expect(result).toBe('Test response with options');
      expect(mockRouter.execute.calledWith({
        prompt: 'Test prompt',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        stop: ['END']
      }, ['openai'])).toBe(true);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedService = new EnhancedLLMService();

      try {
        await uninitializedService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('Enhanced LLM Service not initialized. Call initialize() first.');
      }
    });

    it('should handle completion errors', async () => {
      const error = new Error('Completion failed');
      mockRouter.execute.rejects(error);

      try {
        await service.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (thrownError) {
        expect(thrownError).toBe(error);
        expect(consoleErrorStub.calledWith('Enhanced LLM Service completion error:', error)).toBe(true);
      }
    });
  });

  describe('completeWithMetadata', () => {
    beforeEach(async () => {
      sandbox.stub(LLMRouter, 'create').resolves(mockRouter);
      await service.initialize();
    });

    it('should return complete response with metadata', async () => {
      const mockResponse = {
        text: 'Test response',
        model: 'gpt-3.5-turbo',
        provider: 'openai',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15
        },
        metadata: { requestId: '123' }
      };

      mockRouter.execute.resolves(mockResponse);

      const result = await service.completeWithMetadata('Test prompt');

      expect(result).toEqual(mockResponse);
      expect(mockRouter.execute.calledOnce).toBe(true);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedService = new EnhancedLLMService();

      try {
        await uninitializedService.completeWithMetadata('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('Enhanced LLM Service not initialized. Call initialize() first.');
      }
    });
  });

  describe('getAvailableModels', () => {
    it('should return empty array when not initialized', () => {
      const models = service.getAvailableModels();
      expect(models).toEqual([]);
    });

    it('should return available models when initialized', async () => {
      sandbox.stub(LLMRouter, 'create').resolves(mockRouter);
      await service.initialize();

      const models = service.getAvailableModels();
      expect(models).toContain('gpt-3.5-turbo');
      expect(models).toContain('gpt-4');
      expect(models).toContain('claude-3-opus-20240229');
      expect(models).toContain('gemini-pro');
      expect(models).toContain('llama2');
    });
  });

  describe('getProviderStatus', () => {
    beforeEach(async () => {
      sandbox.stub(LLMRouter, 'create').resolves(mockRouter);
      await service.initialize();
    });

    it('should return null when not initialized', () => {
      const uninitializedService = new EnhancedLLMService();
      const status = uninitializedService.getProviderStatus('test-provider');
      expect(status).toBeNull();
    });

    it('should return specific provider status', () => {
      const mockStatus = {
        name: 'test-provider',
        type: 'openai',
        enabled: true,
        lastUsed: 0,
        failureCount: 0,
        successCount: 1
      };

      mockRouter.getProviderStatus.returns(mockStatus);

      const status = service.getProviderStatus('test-provider');
      expect(status).toEqual(mockStatus);
      expect(mockRouter.getProviderStatus.calledWith('test-provider')).toBe(true);
    });

    it('should return all provider statuses when no provider specified', () => {
      // Since getAvailableProviders returns empty array, this should return empty object
      const status = service.getProviderStatus();
      expect(status).toEqual({});
    });
  });

  describe('updateProviderConfig', () => {
    beforeEach(async () => {
      sandbox.stub(LLMRouter, 'create').resolves(mockRouter);
      await service.initialize();
    });

    it('should update provider configuration', () => {
      const updates = { enabled: false };

      service.updateProviderConfig('test-provider', updates);

      expect(mockRouter.updateProviderConfig.calledWith('test-provider', updates)).toBe(true);
    });

    it('should throw error when not initialized', () => {
      const uninitializedService = new EnhancedLLMService();

      expect(() => {
        uninitializedService.updateProviderConfig('test-provider', { enabled: false });
      }).toThrow('Enhanced LLM Service not initialized. Call initialize() first.');
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy when not initialized', async () => {
      const health = await service.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('Enhanced LLM Service not initialized');
      expect(health.providers).toEqual({});
    });

    it('should return healthy when service is working', async () => {
      sandbox.stub(LLMRouter, 'create').resolves(mockRouter);
      await service.initialize();

      mockRouter.execute.resolves({
        text: 'Hello response',
        model: 'gpt-3.5-turbo',
        provider: 'openai'
      });

      const mockProviderStatus = {
        'test-provider': {
          name: 'test-provider',
          enabled: true
        }
      };

      // Mock getProviderStatus to return the mock status
      const getProviderStatusStub = sandbox.stub(service, 'getProviderStatus').returns(mockProviderStatus);

      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.message).toContain('Service operational with 1 healthy providers');
      expect(health.providers).toEqual(mockProviderStatus);
    });

    it('should return unhealthy when completion fails', async () => {
      sandbox.stub(LLMRouter, 'create').resolves(mockRouter);
      await service.initialize();

      const error = new Error('Completion failed');
      mockRouter.execute.rejects(error);

      const health = await service.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('Health check failed: Completion failed');
    });
  });

  describe('singleton instance', () => {
    it('should export singleton instance', () => {
      expect(__test__.service).toBeInstanceOf(EnhancedLLMService);
    });

    it('should export class constructor', () => {
      expect(__test__.EnhancedLLMService).toBe(EnhancedLLMService);
    });
  });
});
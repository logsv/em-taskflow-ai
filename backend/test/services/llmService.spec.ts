import sinon from 'sinon';
import axios from 'axios';
import llmService, { __test__ } from '../../src/services/llmService.js';

describe('LLM Service', () => {
  let axiosStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;
  let consoleWarnStub: sinon.SinonStub;

  beforeEach(() => {
    axiosStub = sinon.stub(axios, 'post');
    consoleErrorStub = sinon.stub(console, 'error');
    consoleWarnStub = sinon.stub(console, 'warn');
    // Set provider to ollama for consistent testing
    __test__.setProvider('ollama');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('complete', () => {
    it('should complete text using Ollama by default', async () => {
      const mockResponse = {
        data: {
          response: 'This is a test response from Ollama'
        }
      };
      axiosStub.resolves(mockResponse);

      const result = await llmService.complete('Test prompt');

      expect(result).toBe('This is a test response from Ollama');
      expect(axiosStub.calledOnce).toBe(true);
      expect(axiosStub.calledWith('http://localhost:11434/api/generate')).toBe(true);
    });

    it('should handle custom options', async () => {
      const mockResponse = {
        data: {
          response: 'Custom response'
        }
      };
      axiosStub.resolves(mockResponse);

      const result = await llmService.complete('Test prompt', {
        model: 'custom-model',
        temperature: 0.5,
        max_tokens: 100
      });

      expect(result).toBe('Custom response');
      expect(axiosStub.calledOnce).toBe(true);
      
      const callArgs = axiosStub.getCall(0).args;
      expect(callArgs[1].model).toBe('custom-model');
      expect(callArgs[1].prompt).toBe('Test prompt');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        data: {
          response: ''
        }
      };
      axiosStub.resolves(mockResponse);

      const result = await llmService.complete('Test prompt');

      expect(result).toBe('');
    });

    it('should handle missing response field', async () => {
      const mockResponse = {
        data: {}
      };
      axiosStub.resolves(mockResponse);

      const result = await llmService.complete('Test prompt');

      expect(result).toBe('');
    });

    it('should handle Ollama service errors', async () => {
      axiosStub.rejects(new Error('Connection refused'));

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('LLM provider failed');
      }
    });

    it('should handle network timeout', async () => {
      axiosStub.rejects(new Error('timeout'));

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('LLM provider failed');
      }
    });
  });

  describe('getAvailableModels', () => {
    it('should fetch available models from Ollama', async () => {
      const mockResponse = {
        data: {
          models: [
            { name: 'deepseek-r1:latest' },
            { name: 'llama2:7b' },
            { name: 'codellama:13b' }
          ]
        }
      };
      
      const axiosGetStub = sinon.stub(axios, 'get').resolves(mockResponse);

      const models = await llmService.getAvailableModels();

      expect(models).toEqual(['deepseek-r1:latest', 'llama2:7b', 'codellama:13b']);
      expect(axiosGetStub.calledOnce).toBe(true);
      expect(axiosGetStub.calledWith('http://localhost:11434/api/tags')).toBe(true);
    });

    it('should handle empty models list', async () => {
      const mockResponse = {
        data: {
          models: []
        }
      };
      
      const axiosGetStub = sinon.stub(axios, 'get').resolves(mockResponse);

      const models = await llmService.getAvailableModels();

      expect(models).toEqual([]);
    });

    it('should handle service unavailable', async () => {
      const axiosGetStub = sinon.stub(axios, 'get').rejects(new Error('Service unavailable'));

      const models = await llmService.getAvailableModels();

      expect(models).toEqual([]);
    });
  });

  describe('provider fallback', () => {
    it('should use default model when none specified', async () => {
      const mockResponse = {
        data: {
          response: 'Default model response'
        }
      };
      axiosStub.resolves(mockResponse);

      await llmService.complete('Test prompt');

      const callArgs = axiosStub.getCall(0).args;
      expect(callArgs[1].model).toBe('deepseek-r1:latest');
    });

    it('should handle malformed response data', async () => {
      axiosStub.resolves({ data: null });

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('LLM provider failed');
      }
    });
  });

  describe('configuration', () => {
    it('should use custom Ollama base URL', async () => {
      __test__.setOllamaBaseUrl('http://custom-ollama:11434');
      
      const mockResponse = {
        data: {
          response: 'Custom URL response'
        }
      };
      axiosStub.resolves(mockResponse);

      await llmService.complete('Test prompt');

      expect(axiosStub.calledWith('http://custom-ollama:11434/api/generate')).toBe(true);
      
      // Reset to default
      __test__.setOllamaBaseUrl('http://localhost:11434');
    });
  });
});
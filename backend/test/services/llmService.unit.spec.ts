import sinon from 'sinon';
import axios from 'axios';
import llmService, { __test__ } from '../../src/services/llmService.js';

describe('LLM Service Unit Tests', () => {
  let axiosPostStub: sinon.SinonStub;
  let axiosGetStub: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    axiosPostStub = sandbox.stub(axios, 'post');
    axiosGetStub = sandbox.stub(axios, 'get');
    
    // Set provider to ollama for consistent testing
    __test__.setProvider('ollama');
    __test__.setOllamaBaseUrl('http://localhost:11434');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('complete function', () => {
    it('should successfully complete with Ollama', async () => {
      const mockResponse = {
        data: {
          response: 'This is a test response from Ollama'
        }
      };
      axiosPostStub.resolves(mockResponse);

      const result = await llmService.complete('Test prompt');

      expect(result).toBe('This is a test response from Ollama');
      expect(axiosPostStub.calledOnce).toBe(true);
      
      const callArgs = axiosPostStub.getCall(0).args;
      expect(callArgs[0]).toBe('http://localhost:11434/api/generate');
      expect(callArgs[1].prompt).toBe('Test prompt');
      expect(callArgs[1].model).toBe('deepseek-r1:latest');
      expect(callArgs[1].stream).toBe(false);
    });

    it('should handle custom options', async () => {
      const mockResponse = {
        data: {
          response: 'Custom model response'
        }
      };
      axiosPostStub.resolves(mockResponse);

      const options = {
        model: 'llama2:7b',
        temperature: 0.8,
        max_tokens: 200
      };

      const result = await llmService.complete('Test prompt', options);

      expect(result).toBe('Custom model response');
      
      const callArgs = axiosPostStub.getCall(0).args;
      expect(callArgs[1].model).toBe('llama2:7b');
      expect(callArgs[1].prompt).toBe('Test prompt');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        data: {
          response: ''
        }
      };
      axiosPostStub.resolves(mockResponse);

      const result = await llmService.complete('Test prompt');

      expect(result).toBe('');
    });

    it('should handle missing response field', async () => {
      const mockResponse = {
        data: {}
      };
      axiosPostStub.resolves(mockResponse);

      const result = await llmService.complete('Test prompt');

      expect(result).toBe('');
    });

    it('should throw error when Ollama is unavailable', async () => {
      axiosPostStub.rejects(new Error('ECONNREFUSED'));

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('LLM provider failed');
      }
    });

    it('should handle axios timeout', async () => {
      axiosPostStub.rejects(new Error('timeout of 5000ms exceeded'));

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('LLM provider failed');
      }
    });

    it('should handle malformed response data', async () => {
      axiosPostStub.resolves({ data: null });

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('LLM provider failed');
      }
    });

    it('should handle response without data field', async () => {
      axiosPostStub.resolves({});

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('LLM provider failed');
      }
    });
  });

  describe('getAvailableModels function', () => {
    it('should fetch available models successfully', async () => {
      const mockResponse = {
        data: {
          models: [
            { name: 'deepseek-r1:latest' },
            { name: 'llama2:7b' },
            { name: 'codellama:13b' }
          ]
        }
      };
      axiosGetStub.resolves(mockResponse);

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
      axiosGetStub.resolves(mockResponse);

      const models = await llmService.getAvailableModels();

      expect(models).toEqual([]);
    });

    it('should handle service unavailable', async () => {
      axiosGetStub.rejects(new Error('Service unavailable'));

      const models = await llmService.getAvailableModels();

      expect(models).toEqual([]);
    });

    it('should handle malformed response', async () => {
      axiosGetStub.resolves({ data: null });

      const models = await llmService.getAvailableModels();

      expect(models).toEqual([]);
    });

    it('should handle missing models field', async () => {
      axiosGetStub.resolves({ data: {} });

      const models = await llmService.getAvailableModels();

      expect(models).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      axiosPostStub.rejects(new Error('Network Error'));

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('LLM provider failed');
      }
    });

    it('should handle server errors', async () => {
      const serverError = new Error('Request failed with status code 500');
      axiosPostStub.rejects(serverError);

      try {
        await llmService.complete('Test prompt');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('LLM provider failed');
      }
    });

    it('should handle JSON parsing errors in response', async () => {
      axiosPostStub.resolves({
        data: 'invalid json response'
      });

      const result = await llmService.complete('Test prompt');

      expect(result).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle very long prompts', async () => {
      const longPrompt = 'a'.repeat(10000);
      const mockResponse = {
        data: {
          response: 'Response to long prompt'
        }
      };
      axiosPostStub.resolves(mockResponse);

      const result = await llmService.complete(longPrompt);

      expect(result).toBe('Response to long prompt');
      expect(axiosPostStub.getCall(0).args[1].prompt).toBe(longPrompt);
    });

    it('should handle special characters in prompt', async () => {
      const specialPrompt = 'Test with special chars: !@#$%^&*(){}[]|\\:";\'<>?,./';
      const mockResponse = {
        data: {
          response: 'Response with special chars'
        }
      };
      axiosPostStub.resolves(mockResponse);

      const result = await llmService.complete(specialPrompt);

      expect(result).toBe('Response with special chars');
    });

    it('should handle unicode characters', async () => {
      const unicodePrompt = 'Test with unicode: 你好世界 🌍 🚀';
      const mockResponse = {
        data: {
          response: 'Unicode response: 你好 🎉'
        }
      };
      axiosPostStub.resolves(mockResponse);

      const result = await llmService.complete(unicodePrompt);

      expect(result).toBe('Unicode response: 你好 🎉');
    });
  });
});
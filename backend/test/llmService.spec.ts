import sinon from 'sinon';
import axios from 'axios';
import { OpenAI } from 'openai';
import { HfInference } from '@huggingface/inference';
import llmService, { __test__ } from '../src/services/llmService.js';

describe('LLM Service', () => {
  let axiosPostStub: sinon.SinonStub;
  let axiosGetStub: sinon.SinonStub;
  let openaiCreateStub: sinon.SinonStub;
  let hfTextGenerationStub: sinon.SinonStub;
  let envStub: sinon.SinonStub;

  beforeEach(() => {
    axiosPostStub = sinon.stub(axios, 'post');
    axiosGetStub = sinon.stub(axios, 'get');
    openaiCreateStub = sinon.stub(__test__.openai.chat.completions, 'create');
    hfTextGenerationStub = sinon.stub();
    __test__.setHf({ textGeneration: hfTextGenerationStub } as any);
    envStub = sinon.stub(process, 'env');

    // Default to Ollama for most tests unless explicitly overridden
    envStub.value({
      LLM_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: 'http://localhost:11434',
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('complete function', () => {
    it('should complete with Ollama when Ollama is the provider', async () => {
      axiosPostStub.resolves({ data: { response: 'Ollama response' } });
      const result = await llmService.complete('test prompt');
      expect(result).toBe('Ollama response');
      expect(axiosPostStub.calledOnceWith('http://localhost:11434/api/generate')).toBe(true);
    });

    it('should complete with OpenAI when OpenAI is the provider', async () => {
      __test__.setProvider('openai');
      openaiCreateStub.resolves({
        choices: [{ message: { content: 'OpenAI response' } }],
      });

      const result = await llmService.complete('test prompt');
      expect(result).toBe('OpenAI response');
      expect(openaiCreateStub.calledOnce).toBe(true);
    });

    it('should complete with HuggingFace when HuggingFace is the provider', async () => {
      __test__.setProvider('huggingface');
      hfTextGenerationStub.resolves({ generated_text: 'HuggingFace response' });

      const result = await llmService.complete('test prompt');
      expect(result).toBe('HuggingFace response');
      expect(hfTextGenerationStub.calledOnce).toBe(true);
    });

    it('should fallback to Ollama if OpenAI is configured but fails', async () => {
      __test__.setProvider('openai');
      openaiCreateStub.rejects(new Error('OpenAI error'));
      axiosPostStub.resolves({ data: { response: 'Ollama fallback response' } });

      const result = await llmService.complete('test prompt');
      expect(result).toBe('Ollama fallback response');
      expect(openaiCreateStub.calledOnce).toBe(true);
      expect(axiosPostStub.calledOnce).toBe(true);
    });

    it('should fallback to Ollama if HuggingFace is configured but fails', async () => {
      __test__.setProvider('huggingface');
      hfTextGenerationStub.rejects(new Error('HuggingFace error'));
      axiosPostStub.resolves({ data: { response: 'Ollama fallback response' } });

      const result = await llmService.complete('test prompt');
      expect(result).toBe('Ollama fallback response');
      expect(hfTextGenerationStub.calledOnce).toBe(true);
      expect(axiosPostStub.calledOnce).toBe(true);
    });

    it('should throw an error if all providers fail', async () => {
      __test__.setProvider('openai');
      openaiCreateStub.rejects(new Error('OpenAI error'));
      axiosPostStub.rejects(new Error('Ollama error'));

      await expectAsync(llmService.complete('test prompt')).toBeRejectedWithError('All LLM providers failed');
    });
  });

  describe('getAvailableModels function', () => {
    it('should return Ollama models when Ollama is the provider', async () => {
      __test__.setProvider('ollama');
      axiosGetStub.resolves({ data: { models: [{ name: 'model1' }, { name: 'model2' }] } });
      const result = await llmService.getAvailableModels();
      expect(result).toEqual(['model1', 'model2']);
      expect(axiosGetStub.calledOnceWith('http://localhost:11434/api/tags')).toBe(true);
    });

    it('should return default model for OpenAI provider', async () => {
      __test__.setProvider('openai');
      const result = await llmService.getAvailableModels();
      expect(result).toEqual(['Default model for openai']);
      expect(axiosGetStub.notCalled).toBe(true);
    });

    it('should return default model for HuggingFace provider', async () => {
      __test__.setProvider('huggingface');
      const result = await llmService.getAvailableModels();
      expect(result).toEqual(['Default model for huggingface']);
      expect(axiosGetStub.notCalled).toBe(true);
    });

    it('should return empty array if Ollama model fetching fails', async () => {
      __test__.setProvider('ollama');
      axiosGetStub.rejects(new Error('Network error'));
      const result = await llmService.getAvailableModels();
      expect(result).toEqual([]);
      expect(axiosGetStub.calledOnce).toBe(true);
    });
  });
});
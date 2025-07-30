import axios from 'axios';
import type { AxiosInstance, AxiosRequestHeaders } from 'axios';
import type { LLMRequest, LLMResponse } from './llmRouter.js';

// Base interface for LLM providers
export interface LLMProvider {
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  
  createCompletion(request: LLMRequest): Promise<LLMResponse>;
  estimateTokens(text: string): number;
}

abstract class BaseProvider implements LLMProvider {
  protected client: AxiosInstance;
  public apiKey: string;

  constructor(
    public name: string,
    public type: string,
    public baseUrl: string,
    apiKey: string = ''
  ) {
    this.apiKey = apiKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    this.client = axios.create({
      baseURL: baseUrl,
      headers: headers as unknown as AxiosRequestHeaders,
      timeout: 30000, // 30 seconds
    });
  }

  abstract createCompletion(request: LLMRequest): Promise<LLMResponse>;
  
  // Simple token estimation (4 chars ≈ 1 token for English text)
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  protected generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class OpenAIPovider extends BaseProvider {
  constructor(apiKey: string = '', baseUrl: string = 'https://api.openai.com/v1') {
    super('openai', 'openai', baseUrl, apiKey);
  }

  async createCompletion(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.post('/chat/completions', {
      model: request.model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: request.prompt }],
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      stop: request.stopSequences,
    });

    const data = response.data;
    const result: LLMResponse = {
      model: data.model || 'unknown',
      text: data.choices?.[0]?.message?.content || '',
      provider: 'openai',
    };

    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      };
    }

    return result;
  }
}

export class AnthropicProvider extends BaseProvider {
  declare public apiKey: string;
  
  constructor(apiKey: string = '', baseUrl: string = 'https://api.anthropic.com/v1') {
    super('anthropic', 'anthropic', baseUrl, apiKey);
    this.apiKey = apiKey;
  }

  async createCompletion(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.post('/v1/messages', {
      model: request.model || 'claude-3-opus-20240229',
      max_tokens: request.maxTokens || 1024,
      messages: [
        { role: 'user', content: request.prompt }
      ],
      temperature: request.temperature || 0.7,
    });

    const data = response.data;
    const result: LLMResponse = {
      model: data.model || 'unknown',
      text: data.content?.[0]?.text || '',
      provider: 'anthropic',
    };

    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      };
    } else {
      // Fallback to estimation if usage data is not available
      const inputTokens = this.estimateTokens(request.prompt);
      const outputTokens = this.estimateTokens(data.content?.[0]?.text || '');
      result.usage = {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
    }

    return result;
  }
}

export class GoogleProvider extends BaseProvider {
  declare public apiKey: string;
  
  constructor(apiKey: string = '', baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta') {
    super('google', 'google', baseUrl, apiKey);
    this.apiKey = apiKey;
  }

  async createCompletion(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.post(`/v1beta/models/${request.model || 'gemini-pro'}:generateContent`, {
      contents: [{
        parts: [{
          text: request.prompt
        }]
      }],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        topP: request.topP,
        stopSequences: request.stopSequences,
      },
    });

    const data = response.data;
    const result: LLMResponse = {
      model: request.model || 'gemini-pro',
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      provider: 'google',
    };

    if (data.usageMetadata) {
      result.usage = {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: (data.usageMetadata.promptTokenCount || 0) + (data.usageMetadata.candidatesTokenCount || 0),
      };
    } else {
      // Fallback to estimation if usage data is not available
      const inputTokens = this.estimateTokens(request.prompt);
      const outputTokens = this.estimateTokens(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
      result.usage = {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
    }

    return result;
  }
}

export class OllamaProvider extends BaseProvider {
  public apiKey: string = '';
  
  constructor(baseUrl: string = 'http://localhost:11434') {
    super('ollama', 'ollama', baseUrl);
  }

  async createCompletion(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.post('/api/generate', {
      model: request.model || 'llama2',
      prompt: request.prompt,
      stream: false,
      options: {
        temperature: request.temperature,
        top_p: request.topP,
        num_predict: request.maxTokens,
        stop: request.stopSequences,
      },
    });

    const data = response.data;
    const result: LLMResponse = {
      model: data.model || request.model || 'llama2',
      text: data.response || '',
      provider: 'ollama',
    };

    // Estimate token usage
    const promptTokens = this.estimateTokens(request.prompt);
    const completionTokens = this.estimateTokens(data.response || '');
    
    result.usage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };

    return result;
  }
}

export function createProvider(config: {
  type: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
}): LLMProvider {
  const { type, name, apiKey, baseUrl } = config;
  
  switch (type) {
    case 'openai':
      return new OpenAIPovider(apiKey || '', baseUrl);
    case 'anthropic':
      return new AnthropicProvider(apiKey || '', baseUrl);
    case 'google':
      return new GoogleProvider(apiKey || '', baseUrl);
    case 'ollama':
      return new OllamaProvider(baseUrl);
    default:
      throw new Error(`Unsupported provider type: ${type}`);
  }
}

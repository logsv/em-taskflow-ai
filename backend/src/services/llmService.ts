import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { HfInference } from '@huggingface/inference';
import axios from 'axios';

dotenv.config();

// Type definitions
interface LLMOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

type LLMProvider = 'openai' | 'huggingface' | 'ollama';

// Determine provider based on available configuration
let PROVIDER: LLMProvider = process.env.LLM_PROVIDER as LLMProvider;
if (!PROVIDER) {
  if (process.env.OPENAI_API_KEY) {
    PROVIDER = 'openai';
  } else if (process.env.HF_API_KEY) {
    PROVIDER = 'huggingface';
  } else {
    PROVIDER = 'ollama';
  }
}

// OpenAI setup (only if API key is available)
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// HuggingFace setup (only if API key is available)
let hf: HfInference | null = null;
if (process.env.HF_API_KEY) {
  hf = new HfInference(process.env.HF_API_KEY);
}

// Ollama setup
const OLLAMA_BASE_URL: string = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

/**
 * Unified LLM completion interface
 * @param prompt - The prompt to send to the LLM
 * @param options - Optional: model, maxTokens, etc.
 */
async function complete(prompt: string, options: LLMOptions = {}): Promise<string> {
  try {
    switch (PROVIDER) {
      case 'openai':
        if (!openai) {
          console.warn('OpenAI not configured, falling back to Ollama');
          return await completeWithOllama(prompt, options);
        }
        const res = await openai.chat.completions.create({
          model: options.model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.max_tokens || 150,
          temperature: options.temperature || 0.7,
        });
        return res.choices[0]?.message?.content?.trim() || '';
      
      case 'huggingface':
        if (!hf) {
          console.warn('HuggingFace not configured, falling back to Ollama');
          return await completeWithOllama(prompt, options);
        }
        const result = await hf.textGeneration({
          model: options.model || 'microsoft/DialoGPT-medium',
          inputs: prompt,
          parameters: {
            max_new_tokens: options.max_tokens || 150,
            temperature: options.temperature || 0.7,
            return_full_text: false,
          },
        });
        return (result as any).generated_text || (result as any).content || '';
      
      case 'ollama':
      default:
        return await completeWithOllama(prompt, options);
    }
  } catch (error) {
    console.error('LLM Service Error:', error);
    // Fallback to Ollama if other providers fail
    if (PROVIDER !== 'ollama') {
      console.warn('Falling back to Ollama due to error');
      return await completeWithOllama(prompt, options);
    }
    return 'Error generating response';
  }
}

async function completeWithOllama(prompt: string, options: LLMOptions = {}): Promise<string> {
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: options.model || 'deepseek-r1:latest',
      prompt: prompt,
      stream: false,
    });
    return response.data.response || '';
  } catch (error) {
    console.error('Ollama Error:', error);
    return 'Error: Ollama service unavailable';
  }
}

/**
 * Get available models for the current provider
 */
async function getAvailableModels(): Promise<string[]> {
  try {
    if (PROVIDER === 'ollama') {
      const res = await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
      return res.data.models.map((model: any) => model.name);
    }
    return [`Default model for ${PROVIDER}`];
  } catch (error) {
    console.error('Error fetching available models:', (error as Error).message);
    return [];
  }
}

const llmService = {
  complete,
  getAvailableModels
};

export default llmService;
export { complete, getAvailableModels };

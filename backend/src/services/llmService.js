require('dotenv').config();
const { OpenAIApi, Configuration } = require('openai');
const { HfInference } = require('@huggingface/inference');

const PROVIDER = process.env.LLM_PROVIDER || 'openai';

// OpenAI setup
const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

// HuggingFace setup
const hf = new HfInference(process.env.HF_API_KEY);

/**
 * Unified LLM completion interface
 * @param {string} prompt - The prompt to send to the LLM
 * @param {object} [options] - Optional: model, maxTokens, etc.
 */
async function complete(prompt, options = {}) {
  if (PROVIDER === 'openai') {
    const model = options.model || 'gpt-3.5-turbo';
    const messages = [{ role: 'user', content: prompt }];
    const res = await openai.createChatCompletion({
      model,
      messages,
      max_tokens: options.maxTokens || 256,
      temperature: options.temperature || 0.7
    });
    return res.data.choices[0].message.content.trim();
  } else if (PROVIDER === 'huggingface') {
    const model = options.model || 'HuggingFaceH4/zephyr-7b-beta';
    const res = await hf.textGeneration({
      model,
      inputs: prompt,
      parameters: { max_new_tokens: options.maxTokens || 256, temperature: options.temperature || 0.7 }
    });
    return res.generated_text.trim();
  } else {
    throw new Error('Unsupported LLM provider');
  }
}

module.exports = { complete };

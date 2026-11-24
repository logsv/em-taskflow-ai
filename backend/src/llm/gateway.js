/**
 * LLM gateway: the one place new code calls a model.
 *
 *   const plan = await llmCall({ task: 'plan', messages, schema: PlanSchema });
 *
 * - Routing: per-task model from config.llmGateway.tasks, default LLM_DEFAULT_MODEL.
 *   Provider is local Ollama unless an OpenAI-compatible cloud provider is explicitly enabled
 *   and selected (LLM_DEFAULT_PROVIDER=openai with LLM_OPENAI_ENABLED=true). Nothing leaves the
 *   machine by default.
 * - Structured output: a zod v4 schema is sent to Ollama as `format` (JSON-schema constrained
 *   decoding), the reply is validated, and on failure ONE repair turn is sent with the
 *   validation errors. A second failure throws LLM_INVALID_OUTPUT (no silent fallback).
 * - Thinking: Qwen3 thinking is set per task (`think`), off unless configured.
 * - Concurrency: a limiter queues requests (a local GPU serves one generation at a time);
 *   interactive tasks are prioritised over background ones.
 */
import Bottleneck from 'bottleneck';
import { z } from 'zod/v4';
import { getLlmConfig, getLlmGatewayConfig } from '../config.js';
import { resolveOllamaBaseUrl } from './index.js';
import { AppError, classifyError } from '../core/errors.js';
import { incCounter } from '../core/metrics.js';
import { info, warn } from '../utils/logger.js';

/** Lower number = higher priority in the limiter. */
const TASK_PRIORITY = { plan: 1, verify: 2, compose: 3, rag_answer: 3, summarize: 6 };

let limiter = null;
let limiterConcurrency = null;

function getLimiter() {
  const max = getLlmGatewayConfig()?.maxConcurrency || 1;
  if (!limiter || limiterConcurrency !== max) {
    limiter = new Bottleneck({ maxConcurrent: max });
    limiterConcurrency = max;
  }
  return limiter;
}

/** Resolve model, provider and thinking for a task. */
export function resolveTaskRoute(task) {
  const llm = getLlmConfig();
  const taskCfg = getLlmGatewayConfig()?.tasks?.[task] || {};
  const provider = llm.defaultProvider || 'ollama';
  const cloudEnabled = provider !== 'ollama' && llm.providers?.[provider]?.enabled && llm.providers?.[provider]?.apiKey;
  return {
    task,
    provider: cloudEnabled ? provider : 'ollama',
    model: taskCfg.model || llm.defaultModel,
    think: !!taskCfg.think,
  };
}

function ollamaBaseUrl() {
  const llm = getLlmConfig();
  return resolveOllamaBaseUrl(llm.providers?.ollama?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
}

/** Strip <think>…</think> blocks some models emit even when thinking is off. */
export function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function toJsonSchema(schema) {
  if (!schema) return undefined;
  if (typeof schema.safeParse === 'function') return z.toJSONSchema(schema);
  return schema; // already a JSON schema object
}

async function postJson(url, body, { timeoutMs, headers = {} } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`LLM provider returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

async function callOllama({ model, messages, jsonSchema, think, temperature, maxTokens, timeoutMs }) {
  const data = await postJson(`${ollamaBaseUrl()}/api/chat`, {
    model,
    messages,
    stream: false,
    think,
    ...(jsonSchema ? { format: jsonSchema } : {}),
    options: { temperature, ...(maxTokens ? { num_predict: maxTokens } : {}) },
  }, { timeoutMs });
  return { content: data?.message?.content ?? '', usage: { promptTokens: data?.prompt_eval_count, completionTokens: data?.eval_count } };
}

async function callOpenAICompatible({ provider, model, messages, jsonSchema, temperature, maxTokens, timeoutMs }) {
  const cfg = getLlmConfig().providers[provider];
  const data = await postJson(`${String(cfg.baseUrl).replace(/\/$/, '')}/chat/completions`, {
    model,
    messages,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(jsonSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'response', schema: jsonSchema, strict: true } } } : {}),
  }, { timeoutMs, headers: { Authorization: `Bearer ${cfg.apiKey}` } });
  return { content: data?.choices?.[0]?.message?.content ?? '', usage: data?.usage || {} };
}

function parseStructured(content, schema) {
  const cleaned = stripThinking(content).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let json;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    return { ok: false, error: `Output is not valid JSON (${err.message}).` };
  }
  if (typeof schema?.safeParse !== 'function') return { ok: true, value: json };
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return { ok: false, error: `Output does not match the schema: ${issues}.` };
}

/**
 * Call a model for a task.
 * @param {Object} args
 * @param {'plan'|'compose'|'verify'|'rag_answer'|'summarize'} args.task
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} args.messages
 * @param {any} [args.schema] zod v4 schema (or JSON schema) for structured output
 * @param {number} [args.temperature]
 * @param {number} [args.maxTokens]
 * @param {number} [args.timeoutMs]
 * @param {(route: object, payload: object) => Promise<{content:string, usage?:object}>} [args.transport] test seam
 * @returns {Promise<{ content: string, value?: any, route: object, attempts: number, usage?: object }>}
 */
export async function llmCall({ task, messages, schema = null, temperature, maxTokens, timeoutMs, transport } = {}) {
  if (!task || !Array.isArray(messages) || messages.length === 0) {
    throw new AppError('VALIDATION', 'llmCall requires a task and messages.');
  }
  const route = resolveTaskRoute(task);
  const jsonSchema = toJsonSchema(schema);
  const effectiveTimeout = timeoutMs || getLlmGatewayConfig()?.requestTimeoutMs || 120000;
  const effectiveTemperature = temperature ?? (schema ? 0 : 0.2);
  const send = transport || ((r, payload) => (r.provider === 'ollama' ? callOllama({ ...r, ...payload }) : callOpenAICompatible({ ...r, ...payload })));

  const run = async (msgs) => {
    const started = Date.now();
    try {
      const out = await getLimiter().schedule({ priority: TASK_PRIORITY[task] ?? 5 }, () => send(route, {
        messages: msgs,
        jsonSchema,
        think: route.think,
        temperature: effectiveTemperature,
        maxTokens,
        timeoutMs: effectiveTimeout,
      }));
      incCounter('llm_calls_total', { task, provider: route.provider, outcome: 'ok' }, 1, 'LLM calls by task and outcome');
      incCounter('llm_call_ms_total', { task }, Date.now() - started, 'Total LLM call time in ms');
      return out;
    } catch (err) {
      incCounter('llm_calls_total', { task, provider: route.provider, outcome: 'error' }, 1, 'LLM calls by task and outcome');
      const classified = classifyError(err);
      if (classified.code === 'INTERNAL' && /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(err?.cause?.message || err?.message))) {
        throw new AppError('LLM_UNAVAILABLE', undefined, { cause: err });
      }
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new AppError('LLM_TIMEOUT', undefined, { cause: err });
      throw classified.code === 'INTERNAL' ? new AppError('LLM_UNAVAILABLE', undefined, { cause: err }) : classified;
    }
  };

  const first = await run(messages);
  if (!schema) {
    return { content: stripThinking(first.content), route, attempts: 1, usage: first.usage };
  }

  const firstParse = parseStructured(first.content, schema);
  if (firstParse.ok) return { content: first.content, value: firstParse.value, route, attempts: 1, usage: first.usage };

  // One repair turn: give the model its own output and the validation error.
  incCounter('llm_repair_total', { task }, 1, 'Structured outputs that needed a repair turn');
  warn({ module: 'llmGateway', action: 'repair', task, error: firstParse.error }, 'Structured output failed validation; sending one repair turn');
  const repairMessages = [
    ...messages,
    { role: 'assistant', content: first.content },
    { role: 'user', content: `${firstParse.error} Reply again with only a JSON object that matches the schema.` },
  ];
  const second = await run(repairMessages);
  const secondParse = parseStructured(second.content, schema);
  if (secondParse.ok) return { content: second.content, value: secondParse.value, route, attempts: 2, usage: second.usage };

  incCounter('llm_invalid_output_total', { task }, 1, 'Structured outputs that failed validation after repair');
  throw new AppError('LLM_INVALID_OUTPUT', undefined, { details: { task, error: secondParse.error } });
}

/** Load the chat model into memory at startup so the first request is not slow. Never throws. */
export async function warmUpModel() {
  const route = resolveTaskRoute('compose');
  if (route.provider !== 'ollama') return { skipped: true };
  try {
    await postJson(`${ollamaBaseUrl()}/api/generate`, { model: route.model, keep_alive: '30m' }, { timeoutMs: 120000 });
    info({ module: 'llmGateway', action: 'warmUp', model: route.model }, `Model ${route.model} loaded`);
    return { loaded: true, model: route.model };
  } catch (err) {
    warn({ module: 'llmGateway', action: 'warmUp', model: route.model, err: err.message }, `Could not pre-load ${route.model}`);
    incCounter('llm_warmup_failed_total', { model: route.model }, 1, 'Model warm-up failures');
    return { loaded: false, model: route.model, error: err.message };
  }
}

/** Test helper: drop the limiter so concurrency config changes apply. */
export function resetGatewayForTests() {
  limiter = null;
  limiterConcurrency = null;
}

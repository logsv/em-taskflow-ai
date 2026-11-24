import { z } from 'zod/v4';
import { config } from '../../src/config.js';
import { llmCall, resolveTaskRoute, stripThinking, resetGatewayForTests } from '../../src/llm/gateway.js';
import { getRouterChain } from '../../src/agent/llmRouter.js';
import { getCounter, resetMetrics } from '../../src/core/metrics.js';

const Plan = z.object({ domains: z.array(z.enum(['dora', 'sprint'])), confidence: z.number().min(0).max(1) });
const MESSAGES = [{ role: 'user', content: 'route this' }];

function scripted(replies) {
  const calls = [];
  const transport = async (route, payload) => {
    calls.push({ route, payload });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return { content: next };
  };
  return { transport, calls };
}

describe('LLM gateway', () => {
  beforeEach(() => {
    resetMetrics();
    resetGatewayForTests();
  });

  it('routes every task to local Ollama with the configured default model', () => {
    const route = resolveTaskRoute('plan');
    expect(route.provider).toBe('ollama');
    expect(route.model).toBe(config.llm.defaultModel);
    expect(route.think).toBeFalse();
  });

  it('sends the zod schema as a JSON schema and returns the validated value', async () => {
    const { transport, calls } = scripted(['{"domains":["dora"],"confidence":0.9}']);
    const res = await llmCall({ task: 'plan', messages: MESSAGES, schema: Plan, transport });
    expect(res.value).toEqual({ domains: ['dora'], confidence: 0.9 });
    expect(res.attempts).toBe(1);
    expect(calls[0].payload.jsonSchema.properties.domains.items.enum).toEqual(['dora', 'sprint']);
    expect(calls[0].payload.temperature).toBe(0);
  });

  it('sends one repair turn with the validation error, then succeeds', async () => {
    const { transport, calls } = scripted(['{"domains":["payroll"],"confidence":2}', '{"domains":["sprint"],"confidence":0.7}']);
    const res = await llmCall({ task: 'plan', messages: MESSAGES, schema: Plan, transport });
    expect(res.attempts).toBe(2);
    expect(res.value.domains).toEqual(['sprint']);
    const repairPrompt = calls[1].payload.messages.at(-1).content;
    expect(repairPrompt).toContain('does not match the schema');
    expect(getCounter('llm_repair_total', { task: 'plan' })).toBe(1);
  });

  it('fails loudly (LLM_INVALID_OUTPUT) when output is still invalid after the repair turn', async () => {
    const { transport } = scripted(['not json', '{"domains":"dora"}']);
    await expectAsync(llmCall({ task: 'plan', messages: MESSAGES, schema: Plan, transport }))
      .toBeRejectedWith(jasmine.objectContaining({ code: 'LLM_INVALID_OUTPUT' }));
    expect(getCounter('llm_invalid_output_total', { task: 'plan' })).toBe(1);
  });

  it('maps an unreachable model to LLM_UNAVAILABLE', async () => {
    const { transport } = scripted([new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:11434') })]);
    await expectAsync(llmCall({ task: 'compose', messages: MESSAGES, transport }))
      .toBeRejectedWith(jasmine.objectContaining({ code: 'LLM_UNAVAILABLE' }));
  });

  it('applies the per-task thinking setting', async () => {
    const saved = config.llmGateway.tasks.plan.think;
    config.llmGateway.tasks.plan.think = true;
    try {
      const { transport, calls } = scripted(['{"domains":[],"confidence":0.5}']);
      await llmCall({ task: 'plan', messages: MESSAGES, schema: Plan, transport });
      expect(calls[0].payload.think).toBeTrue();
    } finally {
      config.llmGateway.tasks.plan.think = saved;
    }
  });

  it('runs one generation at a time by default (local GPU limiter)', async () => {
    let active = 0;
    let maxActive = 0;
    const transport = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active -= 1;
      return { content: 'ok' };
    };
    await Promise.all([1, 2, 3].map(() => llmCall({ task: 'compose', messages: MESSAGES, transport })));
    expect(maxActive).toBe(1);
  });

  it('strips <think> blocks from free-text output', () => {
    expect(stripThinking('<think>internal</think>\nAnswer')).toBe('Answer');
  });
});

describe('Router on the gateway', () => {
  beforeEach(() => resetMetrics());

  it('uses the validated LLM plan', async () => {
    const llmTransport = async () => ({ content: JSON.stringify({ domains: ['dora'], must_use_tools: true, allow_rag: false, confidence: 0.92, reasoning_summary: 'DORA question' }) });
    const plan = await getRouterChain().invoke({ query: 'what is our change failure rate this month', options: { llmTransport } });
    expect(plan.plan_source).toBe('llm');
    expect(plan.domains).toEqual(['dora']);
    expect(getCounter('router_plan_total', { source: 'llm' })).toBe(1);
  });

  it('falls back to the rule plan, labelled, when the planner is unavailable', async () => {
    const llmTransport = async () => {
      throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') });
    };
    const plan = await getRouterChain().invoke({ query: 'calculate dora deployment frequency for the team', options: { llmTransport } });
    expect(plan.plan_source).toBe('rule_fallback');
    expect(plan.plan_fallback_reason).toBe('LLM_UNAVAILABLE');
    expect(plan.domains).toContain('dora');
  });
});

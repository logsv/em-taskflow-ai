---
name: slm-routing-ops
description: Use when changing how a chat query is classified or dispatched — the Fast-Path classifier, LLM router (llmRouter.js), LangGraph supervisor (graph.js), agentService fallback routing, or Ollama model/parameter configuration (src/llm/). Also use when debugging wrong-domain routing, missing handoffs, or Ollama connectivity.
---

# SLM Routing, Supervisor & Ollama Operations

## Request flow (where to look)

| Stage | File | Key symbol |
|---|---|---|
| Fast-Path pre-classifier (<300ms, greetings/code/math/attachments) | `backend/src/agent/llmRouter.js` | `classifyFastPath` |
| LLM router — structured domain decision | `backend/src/agent/llmRouter.js` | `getRouterChain`, `enum` of domains, routing rules in the prompt |
| Keyword fallback routing (when LLM output is unusable) | `backend/src/services/agentService.js` | `VALID_DOMAINS`, keyword `domains.push(...)` block, `domainToolNames` |
| Supervisor + handoffs | `backend/src/agent/graph.js` | `initializeAgent`, `transfer_to_<domain>_agent` fallback handoff |
| Deterministic tool recovery | `backend/src/services/agentService.js` | `recoveryTools` map |
| Model client + parameters | `backend/src/llm/index.js` | temperature (default 0.1), model selection from `app_settings` |

## Rules

- **1 tool per sub-agent.** `hermes3:8b` tool-call accuracy drops sharply past one tool. Never bind extra tools to a micro-agent to "help" it; add a new mode/param to its existing harness schema instead.
- **Domain lists must agree.** The domain set is duplicated in `llmRouter.js` (enum + prompt), `agentService.js` (`VALID_DOMAINS`, `domainToolNames`, keyword fallback, `recoveryTools`) and `graph.js` (default list, fallback handoff, `baseAgents`). A domain missing from any of these produces `unexpected_domains` policy violations or silent misroutes. Grep all of them when touching one.
- **Zero cloud LLMs.** Only Ollama (`http://localhost:11434`, or `http://host.docker.internal:11434` in Docker). Do not add OpenAI/Gemini/Anthropic calls.
- **Never clear `app_settings`** — model selection and Ollama host live there.
- Router prompt changes affect eval scores: run `npm run eval:multi-agent` (needs Ollama) and add a golden-dataset case for the new routing rule.

## Verify

```bash
# Ollama is up and models are pulled
curl -s http://localhost:11434/api/tags
```

```bash
# Classifier + router smoke test (from backend/)
node -e "import('./src/agent/llmRouter.js').then(async (m) => { console.log('fast:', m.classifyFastPath('hello')); console.log('router:', await m.getRouterChain().invoke({ query: 'my PRs' })); });"
```

```bash
# Routing specs (from backend/)
npx jasmine --config=jasmine.json test/agent/llmRouter.spec.js test/agent/graph.spec.js test/agent/scalableRouting.spec.js
```

Then run the full `/verify` skill before declaring done.

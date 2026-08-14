---
name: langgraph-slm-agent
description: Procedures for managing LangGraph supervisor routing, sub-agent tool bounding, and local Ollama SLM execution in EM TaskFlow AI.
---

# LangGraph SLM Agent & Supervisor Skill

Use this skill when developing, testing, or debugging LangGraph supervisor agents, router classifications, or sub-agent ReAct tools.

## 📌 Architecture Overview

1. **Fast-Path Classifier**:
   - `classifyFastPath(query)` checks for direct LLM intent (greetings, code generation, math) in `<300ms`, bypassing tool calls.

2. **Router Chain**:
   - `getRouterChain().invoke({ query })` uses local Ollama (`hermes3:8b`) to classify domains (`dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`, `rag`).

3. **LangGraph Supervisor**:
   - `graph.js` builds state graph with top-level supervisor.
   - Enforces **Tool Bounding Rule**: Specialized worker agents (e.g. `doraAgent`) receive **max 1 tool per invocation** to maintain 95%+ execution accuracy on local `hermes3:8b` SLM.

4. **Observability**:
   - Setting `LANGCHAIN_TRACING_V2=true` automatically traces multi-agent execution steps to LangSmith under project `em-taskflow-ai`.

## 🧪 Verification Commands

### Test Fast-Path & Router Classification
```bash
node -e "import('./src/agent/llmRouter.js').then(async (m) => { console.log('Fast-Path:', m.classifyFastPath('hello')); console.log('Router:', await m.getRouterChain().invoke({ query: 'my PRs' })); });"
```

### Run Full Test Suite
```bash
npm test
```

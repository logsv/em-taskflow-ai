---
name: langgraph-slm-agent
description: Procedures for managing LangGraph supervisor routing, sub-agent tool bounding, and local Ollama SLM execution in EM TaskFlow AI.
---

# LangGraph SLM Agent & Supervisor Skill

Use this skill when developing, testing, or debugging LangGraph supervisor agents, router classifications, or sub-agent ReAct tools.

---

## 📌 Architecture Overview

1. **Fast-Path Classifier**:
   - `classifyFastPath(query)` checks for direct LLM intent (greetings, code generation, math, attachments) in `<300ms`, bypassing tool calls.

2. **Router Chain & Resilient Fallback Parser**:
   - `getRouterChain().invoke({ query })` uses local Ollama (`hermes3:8b`) to classify domains (`dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`, `rag`).
   - Resilient parser (`parseStructuredDecision`) handles malformed or commentary-wrapped JSON.

3. **5-Tier Dispatch & Parallel Fan-Out/Fan-In Engine**:
   - **Tier 1**: Fast-path direct execution (<300ms)
   - **Tier 2 / 3**: Dedicated hybrid RAG search with structured zero-hit onboarding guides
   - **Tier 4**: Direct single-domain execution (≈1.5s)
   - **Tier 5**: Parallel multi-agent fan-out/fan-in (≈3.5s) via `Promise.all`
   - Enforces **Tool Bounding Rule**: Specialized worker agents receive **max 1 tool per invocation** to maintain 95%+ execution accuracy on local `hermes3:8b` SLM.

---

## 🧪 Verification Commands

### Test Fast-Path & Router Classification
```bash
cd backend
node -e "import('./src/agent/llmRouter.js').then(async (m) => { console.log('Fast-Path:', m.classifyFastPath('hello')); console.log('Router:', await m.getRouterChain().invoke({ query: 'my PRs' })); });"
```

### Run Full Test Suite (342 Specs)
```bash
cd backend
npm test
```

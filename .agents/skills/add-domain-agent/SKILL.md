---
name: add-domain-agent
description: Use when adding, renaming or removing an EM domain micro-agent (dora, delivery, sbi, people, sprint, retro, roadmap, okr, sop, critic) or changing which domain a query routes to.
---

# Add or change a domain micro-agent

A domain key is listed in several files. Missing one causes `unexpected_domains` policy violations or silent mis-routing. Read `backend/src/agent/AGENTS.md` first.

## Steps

1. **Agent file**: copy `backend/src/agent/criticAgent.js` to `backend/src/agent/<name>Agent.js`.
   - One tool, built with `createDeterministicToolHarness()` (`featureFlagKey: '<name>'`).
   - Agent built with `createMicroAgent()`. Export `create<Name>Agent` and the tool.
2. **Prompt**: add `<name>AgentPromptTemplate` to `backend/src/agent/prompts.js`.
3. **Register the key** in every one of these (search for an existing key such as `critic` to find each spot):
   - `backend/src/services/domainRegistry.js`: `VALID_DOMAINS`
   - `backend/src/agent/index.js`: export
   - `backend/src/agent/graph.js`: default domain list and the `baseAgents` array
   - `backend/src/agent/llmRouter.js`: `domains` enum, router prompt description, deterministic analyzer
   - `backend/src/services/agentService.js`: domain list, allowed-tool set, fast-path tool map
   - `backend/src/scripts/promptfooServer.js`
4. **Tests**: add `backend/test/agent/<name>Agent.spec.js` (tool output, DB fallback, disabled flag) and routing cases in `backend/test/agent/llmRouter.spec.js`.
5. **Eval data**: add 8–10 items for the domain to `backend/evaluation/golden-dataset.json` (it must validate against `golden-dataset-schema.json`).
6. **Verify**:
   ```bash
   cd backend && npm test
   cd backend && npm run eval:multi-agent   # needs Ollama; see run-evaluations skill
   ```
7. Add the domain to `docs/architecture/langgraph-supervisor.md`.

To **remove** or **rename** a domain, do the same list in reverse. `grep -rn "'<old>'" backend/src backend/test backend/evaluation` must come back empty.

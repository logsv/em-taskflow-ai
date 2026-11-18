---
name: add-micro-agent
description: Step-by-step checklist for adding a NEW EM domain micro-agent (a new domain alongside dora/delivery/sbi/people/sprint/retro/roadmap/okr/sop/critic). Use when the user asks to create, scaffold or register a new agent or domain. The domain name is duplicated across ~12 files; this skill lists every one so nothing is missed.
argument-hint: <domain-name> e.g. "incident"
---

# Add a New Domain Micro-Agent

Domain = `$ARGUMENTS` (lowercase, one word). Below, `<d>` is the domain, `<D>` the PascalCase form, `<tool_name>` the snake_case tool (verb_noun, e.g. `analyze_incident_trends`).

Use `backend/src/agent/okrAgent.js` as the reference implementation. Read it before starting.

## 1. Agent module: `backend/src/agent/<d>Agent.js`

```js
import { z } from 'zod';
import { <d>AgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import { warn } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool, createProvenanceNotice } from './baseAgent.js';

export const <d>Tool = createDeterministicToolHarness({
  name: '<tool_name>',
  description: '…one sentence the router/supervisor can match on…',
  featureFlagKey: '<d>',
  schema: z.object({
    sources: z.array(z.string()).default(['default']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    fetch_fresh_data: z.boolean().default(true),
    // domain params…
  }),
  mcpExecutors: {            // Tier 1: live calls ONLY via safeExecuteMCPTool — no DB access here
    jira: async (args) => { /* … */ },
  },
  dbCacheFallback: async (source, args) => { /* Tier 2: real rows from databaseService */ },
  computeMath: async (sourceResults, args) => { /* pure logic, no I/O */ },
});

export function create<D>Agent(customTools = null, options = {}) {
  return createMicroAgent({ name: options.name || '<d>_agent', defaultTool: <d>Tool, promptTemplate: <d>AgentPromptTemplate, customTools, options });
}
```

Hard rules:
- **Exactly one tool** (`defaultTool`). Need more capability? Add a `mode`/param to the schema.
- **No fake data.** When live and DB sources are both empty, return an explicit empty/`UNAVAILABLE` state with `createProvenanceNotice`. Do **not** add `|| 14`-style defaults or seed hard-coded rows. Some existing agents do this and must not be copied.
- No empty `catch {}`; log with `warn({ module, action, err: err.message }, '…')`.

## 2. Registration checklist (grep each after editing)

| # | File | What to add |
|---|---|---|
| 1 | `backend/src/agent/prompts.js` | `export const <d>AgentPromptTemplate`, and a line for `<d>` in the supervisor prompt |
| 2 | `backend/src/agent/index.js` | `export { create<D>Agent } from './<d>Agent.js';` |
| 3 | `backend/src/agent/graph.js` | import, `options.<d>Agent \|\| await create<D>Agent(...)` in `initializeAgent`, add to `baseAgents`, the default domain list (~L211), and a keyword branch in the fallback handoff (`transfer_to_<d>_agent`) |
| 4 | `backend/src/agent/llmRouter.js` | add to the domain `enum`, a `- '<d>': …` description and routing rule in the prompt, and the keyword heuristic block |
| 5 | `backend/src/services/agentService.js` | `VALID_DOMAINS`, `domainToolNames.<d>` (both the initial map and the post-MCP rebuild ~L900), `recoveryTools.<d>`, keyword fallback `domains.push('<d>')`, and import of `<d>Tool` |
| 6 | `backend/src/config.js` | `<d>: z.boolean()` in the agent schema and `<d>: env.ENABLE_<D>_AGENT` |
| 7 | `backend/src/cache/semanticCache.js` | `DOMAIN_TTL_MAP.<d>` (volatile data → short TTL) |
| 8 | `backend/src/application/chat/ChatApplicationService.js` | human-readable title in the domain→title map (~L500) |
| 9 | `frontend/src/constants/agentPrompts.js` | a Quick Actions (⌘K) entry with keywords |
| 10 | `frontend/src/components/admin/drawers/SystemStatusDrawer.jsx` | status row `{ id: '<d>', name, tool: '<tool_name>' }` |
| 11 | `backend/evaluation/golden-dataset.json` | ≥2 cases: `expected_domains: ['<d>']`, `expected_tool_calls: [{ tool_name: '<tool_name>' }]` |
| 12 | `backend/evaluation/promptfooconfig.yaml`, `backend/src/scripts/promptfooServer.js` | domain description, if routing is evaluated there |

Then check that nothing is missing:

```bash
grep -rn "critic" backend/src frontend/src backend/evaluation --include=*.js --include=*.jsx --include=*.json --include=*.yaml | cut -d: -f1 | sort -u > /tmp/a
grep -rn "<d>" backend/src frontend/src backend/evaluation --include=*.js --include=*.jsx --include=*.json --include=*.yaml | cut -d: -f1 | sort -u > /tmp/b
comm -23 /tmp/a /tmp/b   # files that know about an existing domain but not the new one
```

## 3. Tests: `backend/test/agent/<d>Agent.spec.js`

Follow `backend/test/agent/planningAgents.spec.js`: invoke `<d>Tool.invoke({...})` and assert `status`, `name === '<tool_name>'`, the `data` shape, and the empty-source behaviour (no fabricated values). Add a routing case to `test/agent/llmRouter.spec.js`.

## 4. Verify

Run the `/verify` skill. If Ollama is available, also run `cd backend && npm run eval:multi-agent`.

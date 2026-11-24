# backend/src/agent/AGENTS.md

10 domain micro-agents (`dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`) run under the LangGraph supervisor in `graph.js`. Background: `docs/architecture/langgraph-supervisor.md`, ADR-002.

## Pattern every agent follows (copy an existing agent, e.g. `criticAgent.js`)

1. **One tool per agent.** Local 8B models lose tool-call accuracy with more tools. Never give a sub-agent a second tool.
2. The tool is built with `createDeterministicToolHarness()` from `../mcp/baseToolHarness.js`:
   - `mcpExecutors` / `directApiExecutors`: live calls only, through `safeExecuteMCPTool()` or an integration client. No SQL here.
   - `dbCacheFallback`: PostgreSQL snapshot when live sources fail or are unconfigured. Mark it with `createProvenanceNotice()`.
   - `computeMath`: pure logic, no network or DB.
3. The agent is built with `createMicroAgent()` from `baseAgent.js`. Never call `createAgent()` directly or write your own mock-LLM fallback.
4. Prompts live in `prompts.js`, not inline.
5. Resolve people and repos with `resolveMemberTarget()` / `resolveGithubTarget()`. Never hard-code a user, repo or ticket key.

## Adding, removing or renaming a domain

A domain key appears in several places that must stay in sync. Follow the `add-domain-agent` skill.

## Tests

Agent specs live in `backend/test/agent/`. Routing changes must be covered in `llmRouter.spec.js` or `scalableRouting.spec.js`.
Routing or prompt changes also need `npm run eval:multi-agent` (see the `run-evaluations` skill).

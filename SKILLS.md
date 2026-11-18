# EM TaskFlow AI: Agent Skills Index

Skills are task playbooks for AI coding agents. They live in **`.claude/skills/<name>/SKILL.md`**, where Claude Code discovers them automatically. `.agents/skills` is a symlink to the same folder for Codex, Gemini CLI and Antigravity.

- Rules and architecture: [`AGENTS.md`](AGENTS.md), the single source of truth.
- Every skill's `description` says **when** to use it. Agents choose a skill from that line, so keep it trigger-oriented.
- Don't write test counts or absolute paths into skills. Run `/sync-docs` to catch drift.

## Task skills (invoke directly, e.g. `/verify`)

| Skill | When to use |
| :--- | :--- |
| [`verify`](.claude/skills/verify/SKILL.md) | Run this project's test gates and report real results. Use before saying any code change is done, before committing or pushing, and whenever the user asks to "run tests", "verify" or "check nothing broke". Picks backend (Jasmine), Python (pytest) and frontend (Vite build) suites based on what changed. |
| [`add-micro-agent`](.claude/skills/add-micro-agent/SKILL.md) | Step-by-step checklist for adding a NEW EM domain micro-agent (a new domain alongside dora/delivery/sbi/people/sprint/retro/roadmap/okr/sop/critic). Use when the user asks to create, scaffold or register a new agent or domain. The domain name is duplicated across ~12 files; this skill lists every one so nothing is missed. |
| [`add-mcp-tool`](.claude/skills/add-mcp-tool/SKILL.md) | Checklist for adding a new external integration tool (Jira, GitHub, Notion, Slack, Google Calendar, or a new provider) under backend/src/mcp/ and backend/src/integrations/clients/. Use when the user asks to add, expose or wire up a new MCP/integration tool or API call that agents should be able to invoke. |
| [`sync-docs`](.claude/skills/sync-docs/SKILL.md) | Audit agent-facing docs (CLAUDE.md, AGENTS.md, GEMINI.md, SKILLS.md, .claude/skills/**, docs/**, README.md) against the actual code and fix drift. Use after a feature lands, before a release, when the user asks to update or check docs, or when you notice a doc reference that doesn't match the code. |

## Agents, routing & LLM

| Skill | When to use |
| :--- | :--- |
| [`slm-routing-ops`](.claude/skills/slm-routing-ops/SKILL.md) | Use when changing how a chat query is classified or dispatched — the Fast-Path classifier, LLM router (llmRouter.js), LangGraph supervisor (graph.js), agentService fallback routing, or Ollama model/parameter configuration (src/llm/). Also use when debugging wrong-domain routing, missing handoffs, or Ollama connectivity. |
| [`domain-micro-agent-ops`](.claude/skills/domain-micro-agent-ops/SKILL.md) | Use when modifying or debugging an existing EM domain micro-agent in backend/src/agent/*Agent.js (dora, delivery, sbi, people, sprint, retro, roadmap, okr, sop, critic) — its deterministic tool harness, mcpExecutors, dbCacheFallback, computeMath, or prompt. To create a NEW agent use the add-micro-agent skill. |

## Integrations

| Skill | When to use |
| :--- | :--- |
| [`mcp-integrations-ops`](.claude/skills/mcp-integrations-ops/SKILL.md) | Use when touching backend/src/mcp/ or backend/src/integrations/ — Jira OAuth PKCE, Notion, GitHub PAT/OAuth and GitHub issue sync, Slack (incl. Temporal HITL posting), Google Calendar, integration client facades, credential handling in app_settings, or PostgreSQL fallbacks when a live integration fails. For adding a brand-new tool, use the add-mcp-tool skill. |

## Data, RAG & caching

| Skill | When to use |
| :--- | :--- |
| [`rag-pipeline-ops`](.claude/skills/rag-pipeline-ops/SKILL.md) | Use when working on document upload/ingestion (PDF, CSV, text, images), chunking, embeddings, HyDE, hybrid dense+sparse search with RRF, Cross-Encoder reranking/MMR, single-pass answer synthesis (retriever.js), file-attachment Map-Reduce compression, or chat-history compression. Spans backend/src/rag, backend/src/routes/rag.js and services/python-ai-service. |
| [`multi-tier-caching-ops`](.claude/skills/multi-tier-caching-ops/SKILL.md) | Use when touching backend/src/cache/** (L1 exact cache, L2 Redis semantic cache with entity-alignment gate, tool cache, cacheInvalidator) or Temporal cache-invalidation workflows, changing domain TTLs, or debugging stale/incorrect cached answers. |
| [`db-per-service-ops`](.claude/skills/db-per-service-ops/SKILL.md) | Use when adding/changing tables, migrations, SQL init scripts (docker/), database connection config, or test cleanup that touches PostgreSQL — and whenever deciding which database (taskflow_backend, taskflow_ai, temporal, langfuse_db, or the *_test/*_eval DBs) data belongs in. Covers app_settings credential-preservation rules. |
| [`session-thread-management-ops`](.claude/skills/session-thread-management-ops/SKILL.md) | Use when working on chat sessions and threads — /api/v1/sessions routes, sessions/chat_threads/chat_messages persistence, sidebar pagination, rename/delete/archive actions, title derivation (deriveShortHeader), or chat-history state anchoring. |

## Frontend & product surfaces

| Skill | When to use |
| :--- | :--- |
| [`frontend-copilot-ui-ops`](.claude/skills/frontend-copilot-ui-ops/SKILL.md) | Use when changing the main chat/Copilot UI in frontend/src (not /admin) — chat thread rendering, Quick Actions palette (⌘K, agentPrompts.js), Decision Action Pills, Dev Settings modal, design tokens, responsive layout, or the Vite build. |
| [`admin-portal-ops`](.claude/skills/admin-portal-ops/SKILL.md) | Use when working on the Admin Portal (/admin) — frontend/src/components/admin/**, the admin UI primitives library, external service deep-links (Langfuse, Adminer, Temporal, Promptfoo), vector chunk inspection, or Express endpoints under /api/v1/admin/* (backend/src/routes/admin.js). |
| [`autonomous-em-audit-ops`](.claude/skills/autonomous-em-audit-ops/SKILL.md) | Use when working on the Autonomous EM Health Audit (emAutonomousAuditWorkflow, the 4-hour Temporal cron), Slack audit dispatch modes (consolidated, threaded, nudge), action-item persistence, or the EM Action Hub UI at /actions (backend/src/routes/actions.js, frontend Action Hub components). |
| [`em-dora-productivity-ops`](.claude/skills/em-dora-productivity-ops/SKILL.md) | Use when working on EM metric computations and their storage — DORA tier ratings, sprint health analytics, OKR records, SBI feedback records — or the APIs that expose them (backend/src/routes/v1/em.js, dora_snapshots / sprint_analytics / okr_records tables). |

## Quality & observability

| Skill | When to use |
| :--- | :--- |
| [`enterprise-evaluation-framework-ops`](.claude/skills/enterprise-evaluation-framework-ops/SKILL.md) | Use when running, extending or debugging evaluations — golden-dataset.json, backend/evaluation/** evaluators, promptfoo, the Python LLM-as-judge/DeepEval/Ragas/em_tau_bench suites, nightly eval scripts, or eval gates in CI. Also use after changing router prompts or agent prompts, to add or update eval cases. |
| [`langfuse-analytics-migration`](.claude/skills/langfuse-analytics-migration/SKILL.md) | Use when adding or changing tracing/telemetry (Langfuse spans, scoreTrace, tracer.js/tracing.js) or anything touching the analytics-db (langfuse_db on port 5433). Enforces the rule that telemetry is non-blocking and never writes into application databases. |
| [`structured-json-logging-ops`](.claude/skills/structured-json-logging-ops/SKILL.md) | Use when adding or changing logging in either service — the Pino logger (backend/src/utils/logger.js) or the Python JSONFormatter/handlers — or when fixing empty catch blocks and unstructured console output. |

## Adding or editing a skill

1. Create `.claude/skills/<kebab-name>/SKILL.md` with `name` and `description` frontmatter. Add `argument-hint` if it takes arguments, and `disable-model-invocation: true` if it should only run when a user invokes it.
2. Write the description as *"Use when …"*, listing the paths, symbols or user phrases that should trigger it.
3. Keep the body procedural: where the code is, the rules, the exact verify commands. Link to AGENTS.md instead of repeating architecture.
4. Add it to this index.

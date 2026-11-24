# EM TaskFlow AI — Final Phase-wise Implementation Plan

> The executable plan derived from [`PRODUCT_ENGINEERING_REVIEW.md`](./PRODUCT_ENGINEERING_REVIEW.md) (the "why") and [`CODEBASE_DEEP_DIVE.md`](./CODEBASE_DEEP_DIVE.md) (the "what is").
> Each item has a status: ✅ done · 🚧 in progress · ⬜ not started. Each phase ends with exit criteria that must hold before the next phase starts.

## Fixed decisions

| Decision | Choice |
|---|---|
| Tenancy | Single user (one owner) |
| LLM | Local Ollama first. **Chat model `qwen3:8b-q8_0`** (≈8.9 GB), embeddings `nomic-embed-text`. Cloud is an opt-in plug-in, off by default |
| Model selection criteria | Tool calling > faithfulness > abstention/correction > schema validity > latency (guardrail only) |
| Answers | Document Q&A, tool-grounded answers and hybrids are all core |
| Language | JavaScript (ESM); JSDoc typedefs plus zod schemas; no build step |
| Hardware | Mac mini M4, 16 GB unified memory, 256 GB disk. Ollama runs natively on macOS |

---

## Phase 0 — Stop the bleeding

Goal: safe to run, honest output, correct configuration, new model.

| # | Item | Files | Status |
|---|---|---|---|
| 0.1 | Switch chat model to `qwen3:8b-q8_0` through one config value (`LLM_DEFAULT_MODEL`); replace hard-coded `hermes3:8b` defaults; migrate a stored legacy model in `app_settings` | `config.js`, `llm/index.js`, `settingsService.js`, `routes/admin.js`, `temporal/client.js`, Python eval defaults, `docker-compose.yml`, `.env.example` | ✅ |
| 0.2 | Ollama setup script for the Mac mini: pull `qwen3:8b-q8_0` + `nomic-embed-text`, remove every other local model, apply 16 GB settings | `scripts/setup-ollama-models.sh` | ✅ |
| 0.3 | Config correctness: string `"false"` must mean false for every boolean flag; add missing env keys (`GITHUB_OWNER`, `GITHUB_USERNAME`, `GITHUB_REPO`, `FRONTEND_URL`, auth keys) to the schema | `config.js` | ✅ |
| 0.4 | Single-owner auth on every route except health and OAuth callbacks: bearer token or signed `HttpOnly; SameSite=Strict` cookie; login/logout/status endpoints; frontend login gate; production refuses to start without a token | `middleware/auth.js`, `routes/v1/auth.js`, `routes/v1/index.js`, `index.js`, `frontend/src/…` | ✅ |
| 0.5 | CORS locked to `FRONTEND_URL`; no hard-coded third-party credentials in compose; debug port 9229 closed by default | `index.js`, `docker-compose.yml` | ✅ |
| 0.6 | Remove fabricated fallbacks: fictional engineer, invented DORA sub-metrics, fake Slack channels, test fixtures inside production code | `peopleAgent.js`, `doraAgent.js`, `mcp/slack.js`, `sprintAgent.js` | ✅ |
| 0.7 | Correctness fixes: shadow-eval contract; tool-name mismatches; people tool receives a resolved engineer or nothing; word-boundary keyword routing; thread-message ownership check; init SQL; session cleanup worker wired; MCP timeout timer leak; `SIGTERM`; nyc coverage path; DB password not logged | various (see review B.5) | ✅ |
| 0.8 | Honest evaluation: judges raise instead of returning canned scores; failed evaluations report FAILED with null scores (no 0.965 / 1.0 defaults); heuristic judges labelled as heuristics; live-judge tests skip without Ollama; DeepEval telemetry opted out | `services/python-ai-service/evaluation/*`, `app/temporal/activities.py`, `app/telemetry/shadow_evaluator.py`, `evaluations/engine/evals/*` | ✅ |

**Exit criteria.** No unauthenticated route (except health and OAuth callbacks) when a token is configured. Zero fictional entities in production code. Shadow-eval requests accepted by the Python service. Backend and Python test suites pass.

**Manual steps for the owner (cannot be done from code).** Rotate the Langfuse, Sentry, New Relic and Axiom keys that were committed in `docker-compose.yml`. Run `scripts/setup-ollama-models.sh` on the Mac mini. Set `AUTH_TOKEN` in `backend/.env`.

---

## Phase 1 — Make failure explicit

| # | Item | Status |
|---|---|---|
| 1.1 | `Result` and `Evidence` JSDoc typedefs + zod schemas (`backend/src/core/`) | ✅ |
| 1.2 | Error taxonomy (`INTEGRATION_UNAUTHORIZED`, `INTEGRATION_UNAVAILABLE`, `LLM_UNAVAILABLE`, `LLM_TIMEOUT`, `RETRIEVAL_EMPTY`, `VALIDATION`, `INTERNAL`) + one Express error middleware; no raw `err.message` to clients | ✅ |
| 1.3 | Tool harness returns `ok \| degraded \| failed` with provenance (`source`, `mode`, `asOf`, `url`); UI renders a source/freshness strip on every answer | ✅ |
| 1.4 | ESLint (no-empty, swallowed-catch ban, no-undef) and ruff (S110, undefined names); `swallow()`/`background()`/`recordHandledError()` helpers with failure counters. Prettier deliberately not added yet (it would reformat most files in one diff) | ✅ |
| 1.5 | Fallback and tool-status metrics (OTel counters); `/api/v1/health/ready` with per-dependency status, including "model loaded" | ✅ |
| 1.6 | Node↔Python contract tests (pydantic JSON Schema checked against the Node client; zod validation of Python responses) | ✅ |
| 1.7 | LLM gateway (`llm/gateway.js`): per-task model routing (Ollama default), constrained JSON output via Ollama `format`, Qwen3 thinking toggle per task, concurrency limiter, model warm-up; cloud as an off-by-default plug-in | ✅ |
| 1.8 | One CI workflow with Postgres (pgvector) and Redis service containers; spec counts reported from the run, not echoed | ✅ |

**Exit criteria.** Zero unannotated swallowed errors. Every degraded answer shows its source and age. Contract tests in CI.

---

## Phase 2 — Collapse the architecture

| # | Item | Status |
|---|---|---|
| 2.1 | Capability registry: one file per capability (description, examples, input schema, `execute`, `render`, flag) | ✅ `src/capabilities/registry.js` (one entry per capability: description, examples, tools with domain + input builder); shared `targets.js`. Router prompt still lists domains (moves onto the registry in 3.1) |
| 2.2 | Merge 10 domains into 5 capabilities: Delivery Health, People & Coaching, Sprint, Planning & Goals, Knowledge & Review | ✅ the 10 tools are grouped into these 5; tools themselves unchanged |
| 2.3 | Pipeline replaces `agentService`, the supervisor and the three routing layers: ContextBuilder → Planner → Executor → Verifier → Composer | 🟡 `src/pipeline/capabilityPipeline.js`: Execute (parallel, per-tool timeout) → Verify (requested domains ran and returned data) → Compose (deterministic, failed sources listed, abstains when nothing succeeded). The supervisor no longer runs for capability domains, for rollout off/shadow, or as a retry; it remains only for integration-only plans (jira/github/notion/calendar/slack needing MCP arguments). RAG outages now say so instead of "no documents". Still to do: planner onto the registry, delete `graph.js`/supervisor once integration lookups are capabilities, LLM composer + verifier for free text (Phase 3) |
| 2.4 | Migrations (`node-pg-migrate` for `taskflow_backend`, numbered SQL for `taskflow_ai`); transactions for multi-write use cases; JSONB everywhere | ✅ backend: numbered SQL in `src/db/migrations` + `src/db/migrator.js` (checksums, advisory lock, one transaction each; no new dependency). Transactions: message pair, audit run + action items, llm/mcp settings pair. GitHub issues batch upsert. Tested on real Postgres. Not done: `taskflow_ai` (Python) migrations; TEXT→JSONB for `chat_messages.metadata`/`citations_json` |
| 2.4b | Team roster columns `current_level`/`target_level`/`tenure_months` default to L4_MID/L5_SENIOR/12 for every auto-discovered member; make them nullable in the first migration | ✅ migration 003 drops the defaults; sync no longer invents levels/tenure, and a re-sync keeps values the owner entered (it used to overwrite them) |
| 2.5 | Split the god files (`postgres.js` → repositories, `admin.js`, `activities.js`, `AdminPage.jsx` → per-tab components + router) | 🟡 `admin.js` (1,227 lines) → `routes/admin/` (system, eval, documents, settings, team, automation). `AdminPage.jsx`: overview tiles + eval gates extracted. `postgres.js` (2,341 lines) → 197-line core (pool, migrations, transactions) + 8 repositories in `src/db/repositories/` mixed into the same `db` object (API unchanged). Remaining: `activities.js`, other AdminPage tabs, removing the in-memory fallback DB |
| 2.6 | Temporal workers as separate processes (restart isolation); lean compose profile (observability optional) | ✅ `src/worker.js` + compose `worker` service (`WORKERS_IN_PROCESS=false` for the API; default true for `npm run dev`); one failing worker no longer stops the others. Langfuse, its DB and Temporal UI behind `--profile observability`, Adminer behind `--profile tools` |
| 2.7 | Delete dead code and unused dependencies; telemetry down to OTel + Langfuse; remove the unused gRPC path and the in-memory "fallback DB" | ✅ dead code, 20 deps and gRPC removed. In-memory fallback DB still present (moves with the repository split, 2.5) |
| 2.8 | Move evaluation tooling out of the end-user Admin Portal into developer CLI/scripts | ✅ `/api/admin/eval/*` mounted only with `ENABLE_DEV_EVAL_ROUTES=true` (404 `FEATURE_DISABLED` otherwise); Quality tab hidden unless the backend reports it on; `npm run eval:*` scripts unchanged |

**Exit criteria.** Adding a capability = one file plus tests. `agentService.js`, `graph.js` and `llmRouter.js` deleted. Lean stack leaves ≥ 9 GB for Ollama on the Mac mini.

---

## Phase 3 — Faithful RAG and tool calling

| # | Item | Status |
|---|---|---|
| 3.1 | Planner: embedding-similarity shortlist (3–5 capabilities) → `qwen3:8b-q8_0` with JSON schema, temperature 0, one repair turn on validation error, then fail loudly | ⬜ |
| 3.2 | Entity resolution (engineer, repo, sprint, window) against the roster before execution; ask when ambiguous | ⬜ |
| 3.3 | Knowledge capability returns `Evidence[]` (chunk IDs, page numbers, rerank scores); abstain below threshold τ; remove RAG/tool exclusivity; hybrid answers | ⬜ |
| 3.4 | Verifier: numbers, entities and citations (`[E#]`/`[D#]`) checked against evidence; deterministic sections only when verification fails | ⬜ |
| 3.5 | Composer: templated numbers and tables; constrained narrative; streaming | ⬜ |
| 3.6 | RAG: one embedding model (`nomic-embed-text`), one rerank, document versioning by content hash, structure-aware chunking with page numbers, retrieval-result cache keyed by corpus version | ⬜ |
| 3.6b | Score the system's real answers: the default Ragas dataset contains hard-coded `answer` strings, so it never measured this system. Generate answers through the real pipeline before scoring | ⬜ |
| 3.6c | Replace heuristic judges (string checks, longer-answer-wins) with a model-based judge on the local model; keep heuristics only as labelled format checks | ⬜ |
| 3.7 | Model-comparison harness over the 138 golden cases with `expected_tool_calls`, using the real planner/executor and recorded tool responses; 20% injected tool failures; pass^k; replace the scripted EM-τ-Bench agent | ⬜ |
| 3.8 | HITL for every write action (Slack, calendar, Jira) | ✅ The only external writes are Slack posts (no calendar/Jira writes exist). `slack_post_message` can only queue a draft for approval: the model-settable `approved_by_human` flag is gone, and a failure to start the approval workflow now fails closed (`NOT_POSTED`) instead of posting directly. Scheduled audits post to Slack only with `AUDIT_SLACK_AUTO_POST=true` (or `notifySlack` on an owner-triggered run). Owner clicks in Actions remain direct |

**Exit criteria (nightly, on `qwen3:8b-q8_0`).** Tool selection ≥ 95%, argument accuracy ≥ 95%, no-call precision ≥ 95%, hallucinated tools = 0, fabrications under tool failure = 0, faithfulness ≥ 98%, citation precision ≥ 95%.

---

## Phase 4 — Product expansion

| # | Item | Status |
|---|---|---|
| 4.1 | Weekly EM brief built from the audit | ⬜ |
| 4.2 | Action item lifecycle: owner, due date, snooze, dismiss-with-reason feeding audit scoring | ⬜ |
| 4.3 | Health score trend view | ⬜ |
| 4.4 | Setup wizard and connection health page | ⬜ |
| 4.5 | Notion/Confluence knowledge sync into the document index | ⬜ |
| 4.6 | Privacy controls: retention, exclude-person, PII redaction in traces | ⬜ |

---

## Progress log

| Date | Phase | Change |
|---|---|---|
| 2026-11-24 | — | Plan written |
| 2026-11-24 | 3 | 3.8 HITL: closed two bypasses in the Slack post tool (LLM-settable approval flag; fail-open when Temporal was down); scheduled audit Slack posts opt-in. Backend 483 / 0 |
| 2026-11-24 | 2 | 2.1–2.3 capability registry (5 capabilities) + deterministic pipeline; supervisor limited to integration-only plans; RAG outage distinguished from zero hits; `postgres.js` split. Backend 482 / 0; Python 44 passed / 12 skipped |
| 2026-11-24 | 2 | Fabrication sweep 2: `/em/okrs`, `/em/sbi`, `/em/sprints` returned invented records (fake OKRs + 78%, a fictional SBI record, 'Sprint 24' 28/35 SP); OKR quarter hard-coded (Q3 vs Q4); OKRs scored against an assumed target of 100; fake PR #402; retriever placeholder score 0.8. Audit bug: DORA read camelCase from snake_case rows for team 'main_team' (snapshots are 'default') so every audit recorded 0s with tier 'Elite'. Snapshots now store NULL, not 0, when unmeasured. Backend 471 / 0 |
| 2026-11-24 | 2 | 2.8 eval tooling behind a dev flag; `admin.js` split. Found and removed fabricated data in `/em/dora` (invented DORA values when no snapshot, constant availability 99.95% / PR cycle 4.2h / sprint 91.4% / churn 6.8%, constant trends, score 96.5) and in the Admin overview (fallbacks, static PASS badges, fake '8 Services', health derived from the fake score). Backend 471 / 0; frontend 11 / 0 |
| 2026-11-24 | 2 | 2.6 worker process split + lean compose (3 fewer containers by default). Backend 466 specs / 0 failures |
| 2026-11-24 | 2 | 2.7 dead code / deps / gRPC removed (688 packages). 2.4 + 2.4b migrations, transactions, nullable roster levels; fixed roster re-sync overwriting entered levels and `''` emails colliding on UNIQUE; removed invented numbers from the audit summary. Backend 463 specs / 0 failures (9 on real Postgres) |
| 2026-11-24 | 1 | Phase 1 implemented: error taxonomy + error middleware (71 routes), 113 swallowed handlers made visible (+29 in Python), ESLint/ruff (found 4 latent ReferenceError bugs), provenance on every tool answer + UI strip, /health/ready + /metrics, Python response validation, LLM gateway (constrained JSON, repair turn, limiter, thinking toggle), one CI workflow with real Postgres/Redis, frontend Vitest. Backend 459 specs / 0 failures; Python 47 passed / 12 skipped; frontend 7 passed |
| 2026-11-24 | 0 | Phase 0 implemented. Backend 430 specs / 0 failures (was 394 / 2), coverage now measured (52% lines, was reported 0%). Python service 47 passed / 12 skipped (live-judge tests need Ollama). Eval engine 4 passed. Frontend builds |

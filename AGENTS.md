# AGENTS.md

Instructions for every AI coding agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI) and every human working in this repo.
Keep this file short. Architecture detail lives in `docs/`; service rules live in each service's own `AGENTS.md`.

## Project map

| Path | What | Local rules |
|---|---|---|
| `backend/` | Node 22 ESM Express API (port 4000), LangGraph supervisor, Temporal worker | `backend/AGENTS.md` |
| `backend/src/agent/` | 10 domain micro-agents + supervisor | `backend/src/agent/AGENTS.md` |
| `backend/src/mcp/`, `backend/src/integrations/` | Jira, Notion, GitHub, Slack, Google Calendar tools | `backend/src/mcp/AGENTS.md` |
| `services/python-ai-service/` | Python 3.12 RAG service (REST 8000, gRPC 50051) | `services/python-ai-service/AGENTS.md` |
| `frontend/` | React 18 + Vite SPA (port 3000), Admin Portal `/admin` | `frontend/AGENTS.md` |
| `proto/ai_service.proto` | gRPC contract between backend and Python service | change both sides in one PR |
| `docs/` | Architecture, ADRs, operations (VitePress) | read `docs/architecture/adrs.md` before changing architecture |

When you work inside a folder listed above, read its `AGENTS.md` first.

## Commands

```bash
docker compose up -d --build                       # full stack
cd backend && npm start                            # backend
cd backend && npm test                             # backend unit tests (needs Postgres on 5432, uses taskflow_test)
cd backend && npm run evaluate                     # eval suite (needs Ollama)
cd services/python-ai-service && uv run pytest     # Python tests
cd frontend && npm start                           # Vite dev server
cd frontend && npm run build                       # production build
```

Do not hard-code test counts anywhere. CI is the source of truth.

## Workflow for every task

Tickets are often incomplete. Do not fill gaps by guessing.

1. **Before writing code**, read the ticket and the relevant code, then write a scope note:
   ```
   Goal:          what will be true when done (1-2 lines)
   Not doing:     explicitly out of scope
   Scope:         paths you will change, e.g. backend/src/mcp/, backend/test/mcp/
   Assumptions / questions:
   ```
2. **Stop and wait** for the developer to approve the scope note. Do not edit files before approval.
3. **Change only the paths in the approved scope.** If you need to go outside it, stop and say why.
4. Run the tests for every service you touched.
5. Put the scope note in the PR description. The `Scope:` line is checked by CI.

## Scope rules (strict)

- No refactors, renames, reformatting or "cleanup" outside the task.
- No new dependencies, helpers, abstractions, config files or docs unless the task needs them.
- Never delete, skip (`xit`, `.skip`, `@pytest.mark.skip`) or weaken existing tests to make them pass.
- New tests cover the behaviour you changed. No tests that only restate the implementation.
- Anything else you would improve: list it under "Follow-ups" in the PR description. Do not change it.
- Reuse existing patterns in the service. If you are unsure which pattern applies, ask.

## Project-wide hard rules

1. **Local LLM only.** All inference goes to Ollama (`hermes3:8b`, `nomic-embed-text`). Never add cloud LLM calls or keys.
2. **Database per service.** `taskflow_backend` = app state; `taskflow_ai` = RAG vectors only; `temporal*` = Temporal only; `langfuse_db` (port 5433) = traces only. Tests use `taskflow_test` / `taskflow_ai_test`; evals use `taskflow_eval` / `taskflow_ai_eval`. DDL and `TRUNCATE` never run against runtime databases.
3. **Never drop, truncate or wipe `app_settings`** (live API keys). When saving settings, a masked value (`******`) keeps the stored secret. Never delete real users in `team_members` during test cleanup.
4. **No fake fallbacks.** Fallbacks return real PostgreSQL snapshots (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_tracker`) or a neutral "unavailable" status. Never hard-coded users, tickets, URLs or confidence scores.
5. **Telemetry never breaks requests.** Langfuse, logging and tracing calls are non-blocking and wrapped so failures are logged, not thrown.
6. **No silent failures.** No empty `catch {}` / bare `except: pass`. Log with the structured logger (`backend/src/utils/logger.js`, `app/telemetry/json_logger.py`). No `console.log` or `print()` in production code.
7. **Debug from evidence.** Read the full error output before forming a hypothesis. Fix causes, not symptoms.
8. **Never commit secrets** (`.env*`, OAuth key files, tokens).

## Skills

Step-by-step workflows live in `.agents/skills/` (also visible to Claude Code as `.claude/skills/`):
`add-domain-agent`, `add-mcp-integration`, `db-schema-change`, `run-evaluations`.

## Changing these instructions

When an agent makes the same mistake twice, add one line to the relevant `AGENTS.md` in a PR.
Keep each file short; remove rules that are stale. `CLAUDE.md` and `GEMINI.md` only import this file.

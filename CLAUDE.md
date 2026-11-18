# CLAUDE.md

Guidance for Claude Code in this repository. The full architecture, hard rules and commands live in **AGENTS.md** (shared by all agents) and are imported here:

@AGENTS.md

---

## Claude Code specifics

### Skills (`.claude/skills/`)
Project skills load automatically when relevant. Task skills you can invoke directly:

| Skill | Use for |
|---|---|
| `/verify [--all\|backend\|python\|frontend]` | Run the test gates and report real results. **Required before saying a change is done or pushing.** |
| `/add-micro-agent <domain>` | Scaffold and register a new EM domain agent (touches ~12 files) |
| `/add-mcp-tool <provider> <tool>` | Add an integration tool: client facade → tool → registration → spec |
| `/sync-docs` | Audit AGENTS.md / skills / docs against the code and fix drift |

Area skills (picked up automatically from their descriptions): `slm-routing-ops`, `domain-micro-agent-ops`, `mcp-integrations-ops`, `rag-pipeline-ops`, `multi-tier-caching-ops`, `db-per-service-ops`, `session-thread-management-ops`, `frontend-copilot-ui-ops`, `admin-portal-ops`, `autonomous-em-audit-ops`, `em-dora-productivity-ops`, `enterprise-evaluation-framework-ops`, `langfuse-analytics-migration`, `structured-json-logging-ops`.

### Hooks (`.claude/settings.json`)
- **PreToolUse / Bash** (`.claude/hooks/guard-bash.mjs`) blocks destructive commands that break AGENTS.md rules: wiping `app_settings` or `team_members`, dropping non-test databases, `docker compose down -v`, force-push, `--no-verify`. If the user really wants one of these, ask them to run it themselves.
- **PostToolUse / Edit|Write** (`.claude/hooks/check-syntax.mjs`) runs `node --check` on JS, `py_compile` on Python, and parses JSON after every edit. Fix reported syntax errors right away.

### Workflow expectations
1. **Plan first** (plan mode) for changes to routing (`llmRouter.js`, `graph.js`, `agentService.js`), caching, DB schema, or anything that spans backend + Python service.
2. **Domain lists are duplicated.** When adding or renaming a domain, follow `/add-micro-agent` rather than editing files ad hoc.
3. **Iterate on one spec file, then run the full gate:** `cd backend && npx jasmine --config=jasmine.json test/<path>.spec.js`, then `/verify`.
4. **Before pushing:** run `/verify`, and for non-trivial diffs `/code-review`. Use `/simplify` after large features.
5. **Never** weaken or skip a test, add hard-coded fallback data, or leave an empty `catch {}` to make something pass (AGENTS.md rules 4–5).
6. Keep docs in sync: if you change something AGENTS.md or a skill describes, update that file in the same change. Don't write test counts into docs.

### Gotchas
- Backend unit tests expect PostgreSQL `taskflow_test` on `localhost:5432`, and some specs need the Python gRPC service. Without them, expect environment failures (`RAG Service processPDF` timeout, `TeamSyncWorker lastRunStatus`). Name them as environmental; don't "fix" them by mocking around the assertion.
- `services/python-ai-service` needs Python 3.12 (`uv sync --python 3.12`); `psycopg-binary` has no 3.13 wheel.
- Fresh `npm ci` in `backend/` on a machine without CUDA: add `--onnxruntime-node-install-cuda=skip`.
- All API routes are under `/api/v1/*`. Legacy `/api/*` is a deprecated alias.

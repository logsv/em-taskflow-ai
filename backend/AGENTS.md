# backend/AGENTS.md

Node 22, ES Modules (`"type": "module"`), Express. Read the root `AGENTS.md` first.

## Layout

| Path | Purpose |
|---|---|
| `src/index.js` | Server entry |
| `src/routes/v1/` | Canonical REST API (`/api/v1/*`). Legacy `/api/*` is aliased by `routes/legacyRouteGate.js` (ADR-009). New endpoints go in `v1` only. |
| `src/application/` | Use-case layer (chat, session, upload, feedback, health) |
| `src/services/agentService.js` | Fast-path classifier, LLM router, supervisor dispatch |
| `src/services/domainRegistry.js` | `VALID_DOMAINS`, the single list of domain keys |
| `src/agent/` | Micro-agents and supervisor. See `src/agent/AGENTS.md` |
| `src/mcp/`, `src/integrations/` | External tools and HTTP clients. See `src/mcp/AGENTS.md` |
| `src/db/postgres.js` | `taskflow_backend` schema (idempotent `CREATE ... IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) and queries |
| `src/persistence/` | Repositories for sessions, threads, messages, feedback |
| `src/cache/` | L1 exact cache, Redis semantic cache, tool cache, invalidation |
| `src/rag/` | HyDE + answer synthesis. Retrieval itself is done by the Python service via `src/grpc/client.js` |
| `src/temporal/` | Workflows, activities, worker |
| `src/utils/logger.js` | Pino logger. Use it everywhere; no `console.*` |
| `test/` | Jasmine specs, mirrors `src/` (`test/agent/`, `test/mcp/`, ...) |
| `evaluation/` | Golden dataset and evaluators (`npm run evaluate`) |

## Commands

```bash
npm start          # server on :4000
npm test           # all specs, against taskflow_test on localhost:5432
npx jasmine --config=jasmine.json test/mcp/baseToolHarness.spec.js   # one spec file
npm run db:clean   # removes test/demo residue; preserves app_settings and real team_members
```

## Rules

- Put a spec for changed behaviour in the matching `test/<area>/` folder. Do not create new top-level test folders.
- Schema changes follow the `db-schema-change` skill. Never add destructive DDL to `postgres.js`.
- RAG retrieval, chunking and embeddings belong to the Python service. Do not reimplement them here.
- Cache TTLs are per domain (see `docs/architecture/redis-semantic-cache.md`). Do not add one global TTL.
- Fallback paths log with `logger.warn({ module, action, err }, '...')` and return real DB data or a neutral status.

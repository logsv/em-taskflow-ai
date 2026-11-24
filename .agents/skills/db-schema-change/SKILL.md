---
name: db-schema-change
description: Use when adding or changing a PostgreSQL table, column or index in taskflow_backend or taskflow_ai, adding a new database, or writing any data cleanup.
---

# Database schema change

Background: `docs/architecture/database-isolation.md`, ADR-003.

## 1. Pick the right database

| Data | Database | Schema lives in |
|---|---|---|
| App state (sessions, threads, settings, snapshots, audit runs, action items) | `taskflow_backend` | `backend/src/db/postgres.js` |
| RAG chunks, embeddings, search indexes | `taskflow_ai` | `services/python-ai-service/app/services/rag_processor/database.py` |
| Traces / telemetry | `langfuse_db` (port 5433) | managed by Langfuse; do not add tables |
| Temporal state | `temporal*` | managed by Temporal; do not touch |

Never put a table in a database it does not belong to.

## 2. Write the change idempotently

Schema is applied on startup, so every statement must be safe to run repeatedly:
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- New columns get a default or are nullable.
- **Forbidden**: `DROP`, `TRUNCATE`, `DELETE` without a `WHERE`, or renaming a column in place. To rename: add the new column, backfill, switch the code, and remove the old column in a later PR after agreement.
- Never touch `app_settings` rows or real `team_members` rows.

## 3. New database

Add it to `docker/postgres/init-databases.sql`, plus a matching `_test` database if tests need it. Update `docs/architecture/database-isolation.md`.

## 4. Cleanup scripts

Cleanup belongs in `backend/scripts/clean-database.js` (`npm run db:clean`). It must keep `app_settings` and real users, and support `--dry-run`.

## 5. Verify

```bash
cd backend && npm test                                # runs against taskflow_test
cd services/python-ai-service && uv run pytest        # runs against taskflow_ai_test
```
Start the stack twice (`docker compose up -d --build`, restart backend) to prove the schema code is idempotent.

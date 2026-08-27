---
name: db-per-service-ops
description: Procedures for managing PostgreSQL database-per-service isolation, container init scripts, taskflow_backend, taskflow_ai, temporal, and langfuse_db in EM TaskFlow AI.
---

# Database Per-Service Isolation Operations Skill

Use this skill when inspecting, verifying, migrating, or troubleshooting isolated PostgreSQL databases in the EM TaskFlow AI platform.

---

## 📌 Database Topology & Schema Separation

| Database | Service Owner | Container / Port | Key Tables |
| :--- | :--- | :--- | :--- |
| **`taskflow_backend`** | Node.js Backend API (Runtime) | `em-taskflow-postgres:5432` | `em_action_items`, `em_audit_runs`, `github_issues`, `sessions`, `chat_threads`, `chat_messages`, `okr_tracker`, `sbi_feedback_records`, `sprint_analytics`, `dora_snapshots`, `team_members`, `app_settings`, `feedback` |
| **`taskflow_test`** | Node.js Test Suite (Unit Specs) | `em-taskflow-postgres:5432` | Isolated test state seeded via `test/fixtures/seedTestData.js` |
| **`taskflow_eval`** | LLM Evaluation Benchmark Suite | `em-taskflow-postgres:5432` | Dedicated evaluation harness database |
| **`taskflow_ai`** | Python AI Service (Runtime RAG) | `em-taskflow-postgres:5432` | `pdf_chunks` (with HNSW vector index & `pg_trgm` FTS index) |
| **`taskflow_ai_test` / `taskflow_ai_eval`** | Python AI Test & Eval Suites | `em-taskflow-postgres:5432` | Isolated test vector chunks |
| **`temporal` & `temporal_visibility`** | Temporal Engine | `em-taskflow-postgres:5432` | Workflow executions, activity tasks, visibility search attributes |
| **`langfuse_db`** | Langfuse Observability | `em-taskflow-analytics-db:5433` | Telemetry traces, spans, prompts, datasets, token costs |

---

## 🛠️ Initialization & Operations

### Container Database Init Script
Containers initialize isolated databases automatically on first boot via `docker/postgres/init-databases.sql`:
```sql
CREATE DATABASE taskflow_backend;
CREATE DATABASE taskflow_ai;
CREATE DATABASE taskflow_test;
CREATE DATABASE taskflow_ai_test;
CREATE DATABASE taskflow_eval;
CREATE DATABASE taskflow_ai_eval;
```

### Safe Database State Reset (Preserving Tool API Keys)
To clear legacy dummy data, action items, audit runs, or test residue without affecting saved tool API tokens:
```bash
# From backend directory
npm run db:clean

# Dry-run inspection mode
node scripts/clean-database.js --dry-run
```

### Inspect Database Tables via CLI
```bash
# List databases on primary postgres container
docker exec em-taskflow-postgres psql -U taskflow -d postgres -c "\l"

# Inspect taskflow_backend tables
docker exec em-taskflow-postgres psql -U taskflow -d taskflow_backend -c "\dt"

# Inspect taskflow_ai tables & vector indexes
docker exec em-taskflow-postgres psql -U taskflow -d taskflow_ai -c "\dt"
docker exec em-taskflow-postgres psql -U taskflow -d taskflow_ai -c "\d pdf_chunks"
```

---

## 🧪 Verification Commands

```bash
# Backend unit tests against taskflow_test (319 specs, 0 failures)
cd backend && npm test

# Python AI unit tests against taskflow_ai_test (39 specs, 0 failures)
cd services/python-ai-service && uv run pytest
```


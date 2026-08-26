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
| **`taskflow_backend`** | Node.js Backend API | `em-taskflow-postgres:5432` | `github_issues`, `sessions`, `chat_threads`, `chat_messages`, `okr_tracker`, `sbi_feedback_records`, `sprint_analytics`, `dora_snapshots`, `team_members`, `app_settings`, `feedback` |
| **`taskflow_ai`** | Python AI Service | `em-taskflow-postgres:5432` | `pdf_chunks` (with HNSW vector index & `pg_trgm` FTS index) |
| **`temporal` & `temporal_visibility`** | Temporal Engine | `em-taskflow-postgres:5432` | Workflow executions, activity tasks, visibility search attributes |
| **`langfuse_db`** | Langfuse Observability | `em-taskflow-analytics-db:5433` | Telemetry traces, spans, user feedback ratings, token costs |

---

## 🛠️ Initialization & Operations

### Container Database Init Script
Containers initialize isolated databases automatically on first boot via `docker/postgres/init-databases.sql`:
```sql
CREATE DATABASE taskflow_backend;
CREATE DATABASE taskflow_ai;
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
# Backend unit tests against taskflow_backend (240 specs, 0 failures)
cd backend && npm test

# Python AI unit tests against taskflow_ai (39 specs, 0 failures)
cd services/python-ai-service && uv run pytest
```

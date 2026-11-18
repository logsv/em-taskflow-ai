---
name: langfuse-analytics-migration
description: Use when adding or changing tracing/telemetry (Langfuse spans, scoreTrace, tracer.js/tracing.js) or anything touching the analytics-db (langfuse_db on port 5433). Enforces the rule that telemetry is non-blocking and never writes into application databases.
---

# Langfuse & Analytics DB Migration Skill

Use this skill when implementing, testing, or auditing observability, self-hosted Langfuse telemetry, or dedicated analytics database connections.

---

## 📌 Non-Hallucination & Architecture Principles

1. **Non-Blocking Telemetry**:
   - Tracing errors MUST be wrapped in non-blocking error handlers.
   - Primary user queries MUST succeed even if the Langfuse server or analytics database is offline.

2. **Strict Database Boundary**:
   - Primary application DB: `postgresql://taskflow:taskflow@localhost:5432/taskflow_backend`
   - Dedicated Analytics DB: `postgresql://langfuse:langfuse@localhost:5433/langfuse_db`

3. **Validation Requirements**:
   - All migration steps must pass `npm test` with **0 failures**.

---

## 🧪 Verification Commands

### Test Primary Database vs Analytics Database Connectivity
```bash
node -e "import('./src/db/postgres.js').then(async (m) => { console.log('Primary DB Connected:', !!m.default); });"
```

### Run Full Test Suite
```bash
cd backend
npm test
```

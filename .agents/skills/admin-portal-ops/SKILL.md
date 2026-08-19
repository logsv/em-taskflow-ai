---
name: admin-portal-ops
description: Operational procedures for managing the Standalone Admin Portal (/admin), external service hubs (Langfuse, Arize Phoenix, Promptfoo, TruLens, Adminer, Temporal), vector chunk inspection, and Express administrative APIs in EM TaskFlow AI.
---

# Admin Portal & Service Operations Skill

Use this skill when developing, testing, or troubleshooting the Standalone Admin Portal (`/admin`), external service deep-links, or administrative endpoints under `/api/admin/*`.

## 📌 Architecture Overview

1. **Standalone Admin Page (`/admin`)**:
   - Access URL: `http://127.0.0.1:3000/admin` (or via **⚙️ Admin Portal ↗** in sidebar footer opening in a new tab `target="_blank"`).
   - Component: `frontend/src/components/AdminPage.jsx` & `AdminPage.css`.

2. **Readymade External Service Hub**:
   - **Langfuse AI Telemetry**: `http://127.0.0.1:3001` (Multi-agent traces, prompt costs, latency, user feedback).
   - **Arize Phoenix Tracing**: `http://127.0.0.1:6006` (Local OpenLLMetry LLM tracing & chunk retrieval spans).
   - **Promptfoo Managed Cloud**: `https://www.promptfoo.app` (Prompt matrix comparison, security red-teaming, and shared evaluation dashboard for `emtaskflow-ai`).
   - **TruLens RAG Triad Leaderboard**: `http://127.0.0.1:8501` (RAG triad groundedness and relevance dashboard).
   - **Adminer Postgres Explorer**: `http://127.0.0.1:8080/?pgsql=postgres&username=taskflow&db=taskflow_backend` (Pre-configured for `taskflow_backend`, `taskflow_ai`, and `langfuse_db`).
   - **Temporal Web UI**: `http://127.0.0.1:8233` (Durable workflow execution dashboard).

3. **Backend Express Admin Endpoints (`src/routes/admin.js`)**:
   - `GET /api/admin/system-status`: Aggregates process uptime, Ollama status, DB connections.
   - `GET /api/admin/documents`: Lists ingested RAG PDF documents and chunk counts.
   - `GET /api/admin/documents/:filename/chunks`: Fetches extracted text chunks for PDF chunk inspection modal.
   - `DELETE /api/admin/documents/:filename`: Purges document vector chunks from PostgreSQL.
   - `GET /api/admin/telemetry`: Returns fast-path vs supervisor ratios and feedback ratings.

## 🧪 Verification Commands

### Check System Admin Status API
```bash
curl -s http://localhost:4000/api/admin/system-status
```

### Test PDF Document Chunk Retrieval
```bash
curl -s http://localhost:4000/api/admin/documents/01-valid.pdf/chunks
```

### Verify Container Services Status
```bash
docker compose ps
```

### Run Full Test Suite
```bash
npm test
```

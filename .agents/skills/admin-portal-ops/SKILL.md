---
name: admin-portal-ops
description: Operational procedures for managing the Standalone Admin Portal (/admin), external service hubs (Langfuse, Promptfoo, Adminer, Temporal), DORA metrics tier ratings, vector chunk inspection, and Express administrative APIs in EM TaskFlow AI.
---

# Admin Portal & Service Operations Skill

Use this skill when developing, testing, or troubleshooting the Standalone Admin Portal (`/admin`), external service deep-links, UI design primitives, or administrative endpoints under `/api/admin/*`.

---

## 📌 Architecture Overview

### 1. Standalone Admin Portal & Shell Architecture (`/admin`)
- **Access URL**: `http://127.0.0.1:3000/admin` (or via **⚙️ Admin Portal ↗** in sidebar footer opening in a new tab `target="_blank"`).
- **Global Shell & Navigation**: `frontend/src/components/admin/AdminShell.jsx` & `AdminShell.css`.
  - Replaces repeated 5-card KPI strips with a single compact `● System Healthy` status pill in the header.
  - Clicking the health pill opens the **System Diagnostics Drawer** (`SystemStatusDrawer.jsx`), inspecting all 10 domain micro-agents, Ollama port 11434, PostgreSQL 5432, Langfuse DB 5433, and RAG vector store.
  - Global Navigation tabs:
    1. **Overview** (`?tab=overview`): Operator-first landing page with *Needs Attention* + DORA metrics summary.
    2. **People** (`?tab=team` / `?tab=people`): Table-first team directory, career progression, and identity resolution.
    3. **AI Platform** (`?tab=settings` / `?tab=models` / `?tab=tools`): Nested sub-tabs for *Inference Models* & *Tools & MCP Connectors*.
    4. **Operations** (`?tab=services` / `?tab=storage`): Nested sub-tabs for *Service Catalog* (8 tools) & *Storage & RAG Management*.
    5. **Quality** (`?tab=evaluation` / `?tab=quality`): Unified evaluation workflow and benchmark history table.

### 2. Design System Primitives & Tokens (`frontend/src/components/admin/`)
- **Semantic CSS Tokens**: `adminTokens.css` (semantic colors, standard button/input heights, border radii, dark mode elevation).
- **Reusable UI Primitives (`ui/`)**:
  - `Button.jsx` & `IconButton.jsx`: Standardized variants (`primary`, `secondary`, `tertiary`, `danger`, `ghost`) + loading state.
  - `Badge.jsx` & `StatusBadge.jsx`: Semantic status tags with glowing dot indicators.
  - `Card.jsx` & `MetricCard.jsx`: Structured cards (`Header`, `Body`, `Footer`) and metric widgets with trend indicators.
  - `Section.jsx`: Section containers with title, description, and action bars.
  - `Tabs.jsx`: Horizontal tab bars with icons and badges.
  - `Table.jsx`: Data table with custom cell rendering and empty states.
  - `Drawer.jsx` & `Modal.jsx`: Slide-over progressive disclosure drawers and modal dialogs with Esc key listeners and focus trapping.
  - `Dropdown.jsx`: Accessible quick actions dropdown menu.
  - `Feedback.jsx`: `SearchInput`, `EmptyState`, `Skeleton` shimmer, and semantic `Alert` banners.

### 3. Readymade External Service Hub (8 Portals)
- **Langfuse AI Telemetry**: `http://127.0.0.1:3001` (Multi-agent traces, prompt costs, latency, user feedback).
- **Promptfoo Managed Cloud**: `https://www.promptfoo.app` (Cloud prompt matrix comparison, LLM red-teaming, shared evaluation).
- **Adminer Postgres Explorer**: `http://127.0.0.1:8080/?pgsql=postgres&username=taskflow&db=taskflow_backend` (Pre-configured for `taskflow_backend`, `taskflow_ai`, and `langfuse_db`).
- **Temporal Web UI**: `http://127.0.0.1:8233` (Durable workflow execution dashboard).
- **Sentry Cloud**: `https://sentry.io` (Error monitoring and stack traces).
- **New Relic APM**: `https://one.newrelic.com` (Full-stack telemetry and profiling).
- **Axiom Cloud**: `https://app.axiom.co` (Pino JSON log analytics).
- **Swagger API Explorer**: `http://127.0.0.1:4000/api/docs` (Interactive OpenAPI 3.1 REST API docs).

### 4. Backend Express Admin Endpoints (`src/routes/admin.js`)
- `GET /api/admin/system-status`: Aggregates process uptime, Ollama status, DB connections.
- `GET /api/admin/documents`: Lists ingested RAG PDF documents and chunk counts.
- `GET /api/admin/documents/:filename/chunks`: Fetches extracted text chunks for PDF chunk inspection modal.
- `DELETE /api/admin/documents/:filename`: Purges document vector chunks from PostgreSQL.
- `GET /api/admin/telemetry`: Returns fast-path vs supervisor ratios and feedback ratings.
- `GET /api/admin/settings`: Fetches current LLM and MCP configuration with hot-reload metadata.
- `PUT /api/admin/settings`: Persists and hot-reloads model and tool settings into PostgreSQL runtime.
- `POST /api/admin/settings/reset`: Restores settings to initial `.env` baseline defaults.
- `POST /api/admin/settings/test-connection`: Tests connectivity and latency for Ollama, Jira, GitHub, Notion, Google Calendar, or Slack.
- `GET /api/admin/team`: Lists team members, MCP handles, and AI routing aliases.
- `POST /api/admin/team/sync`: Auto-discovers and harvests contributors from GitHub, Jira, and Notion.
- `GET /api/admin/eval/metrics`: Returns golden dataset quality scores, domain precision, and latency SLAs.
- `POST /api/admin/eval/run-deep-benchmark`: Triggers Ragas full RAG triad benchmark via Temporal.
- `POST /api/admin/eval/prompt-matrix`: Executes micro-batched prompt matrix evaluation via Temporal.
- `POST /api/admin/eval/replay-traces`: Replays historical Langfuse failure traces for model upgrade comparison.
- `POST /api/admin/audit/trigger`: Dispatches autonomous 10-domain audit and Slack notifications.

### 5. 🔒 Database Credential & Key Persistence Rules
- **`app_settings` Protection**: Never delete or overwrite configured API keys (`JIRA_API_TOKEN`, `GITHUB_TOKEN`, `NOTION_API_KEY`, etc.) when saving or updating model/tool configs. Masked secret fields (`******`) must always retain their existing database values.
- **Dynamic Identity Protection**: Real lead user profiles in `team_members` (`logsv`, admin emails) must never be purged during mock test fixture cleanups.
- **Docker Ollama Bridge**: On Docker environments, Ollama connectivity from backend automatically bridges to `http://host.docker.internal:11434` if `http://localhost:11434` fails.

---

## 🧪 Verification Commands

### Test Frontend Build
```bash
cd frontend
npm run build
```

### Check System Admin Status API
```bash
curl -s http://localhost:4000/api/admin/system-status
```

### Test PDF Document Chunk Retrieval
```bash
curl -s http://localhost:4000/api/admin/documents/01-valid.pdf/chunks
```

### Test Slack HITL Approval Workflow via API
```bash
# 1. Draft post
curl -X POST http://localhost:4000/api/admin/temporal/slack-post/request \
  -H "Content-Type: application/json" \
  -d '{"channel": "#engineering-retro", "message": "Sprint retro completed successfully."}'

# 2. Approve draft post
curl -X POST http://localhost:4000/api/admin/temporal/slack-post/approve \
  -H "Content-Type: application/json" \
  -d '{"workflowId": "slack-post-hitl-12345", "approver": "Alex (EM)"}'
```

### Verify Container Services Status
```bash
docker compose ps
```

### Run Full Backend Test Suite
```bash
cd backend
npm test
```


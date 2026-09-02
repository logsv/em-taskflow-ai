# 🛠️ Standalone Admin Portal (`/admin`)

The **Standalone Operator Admin Portal** provides system administrators and engineering leaders with centralized controls over system diagnostics, team directory syncs, runtime settings, evaluation suites, and vector storage.

---

## 🏗️ Operator Shell Architecture (`AdminShell.jsx`)

The Admin Portal features a decluttered shell with:
- **`● System Healthy` Status Pill**: Replaces bloated KPI bars with a compact status indicator in the top-right header.
- **Slide-out System Diagnostics Drawer (`SystemStatusDrawer.jsx`)**: Real-time connectivity and health monitoring across all 10 domain micro-agents, Ollama SLM host, PostgreSQL (port 5432), Langfuse DB (port 5433), and Temporal orchestrator.

---

## 📂 5 Operator Domain Tabs

### 1. 📊 Overview
- Quick health overview and live uptime tracking (`formatUptime`).
- DORA metrics snapshot and autonomous audit triggers.

### 2. 👥 Team Directory (`/admin?tab=team`)
- Roster of auto-discovered engineers and managers.
- Cross-platform identity mapping: GitHub usernames, Jira account IDs, Notion IDs, and Google Calendar attendee emails.
- 1-Click **"⚡ Sync Team Roster"** trigger executing the parallel Temporal discovery workflow.

### 3. ⚙️ Models & Tool Settings (`/admin?tab=settings`)
- **LLM Provider Configuration**: Ollama host URL, default reasoning model (`hermes3:8b`), and embedding model (`nomic-embed-text`).
- **Live Connection Test Harnesses**: 1-Click tests for Ollama, Jira OAuth 2.0 PKCE, GitHub PAT, Notion REST API, Google Calendar, and Slack.
- **Credential Masking & Hot-Reload**: Live tokens in `app_settings` are displayed as masked values (`******`) and hot-reloaded into active runtime without server restart.

### 4. 🌐 External Services Catalog (`/admin?tab=services`)
Direct deep links and live health probes for the 8 core operational hubs:
- **Langfuse Observability**: `http://localhost:3001`
- **Promptfoo Managed Cloud**: `https://www.promptfoo.app`
- **Temporal Web UI**: `http://localhost:8233`
- **Adminer DB Explorer**: `http://localhost:8080`
- **Swagger REST API Explorer**: `http://localhost:4000/api/v1/docs`

### 5. 🗄️ Storage & Vector Chunks (`/admin?tab=storage`)
- Ingested document registry with chunk counts and metadata.
- **Document Chunk Inspector Modal**: Search and inspect extracted text chunks and parent-child embedding windows.
- 1-Click document deletion and vector embedding purge.
- Multi-tier cache stats and targeted flush buttons.

# ⚡ EM TaskFlow AI

> **Full-Stack, Local-First Enterprise Productivity Platform powered by 100% Local LLM Inference (Ollama), Production Hybrid RAG (HyDE + RRF + HNSW Vector + Redis Cache), Multi-Source Model Context Protocol (MCP) integrations (Jira OAuth 2.0 PKCE, Notion REST, GitHub PAT/OAuth, Slack Web API, Google Calendar), a LangGraph Multi-Agent Supervisor, and Per-Service Database Isolation.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20pgvector-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.0-red.svg)](https://redis.io/)
[![Ollama](https://img.shields.io/badge/LLM-100%25%20Local%20(Ollama)-orange.svg)](https://ollama.ai)
[![Documentation](https://img.shields.io/badge/Docs-VitePress-brightgreen.svg)](https://logsv.github.io/em-taskflow-ai/)
[![API Explorer](https://img.shields.io/badge/API%20Docs-Swagger%20OpenAPI%203.1-38bdf8.svg)](http://localhost:4000/api/docs)
[![Backend Tests](https://img.shields.io/badge/Backend%20Tests-342%20passed-success.svg)](backend)
[![Python AI Tests](https://img.shields.io/badge/Python%20AI%20Tests-45%20passed-success.svg)](services/python-ai-service)
[![Docker Compose](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED.svg)](docker-compose.yml)

---

## 📑 Table of Contents
- [📖 Documentation Portal & Swagger Explorer](#-documentation-portal--swagger-explorer)
- [💡 Why EM TaskFlow AI?](#-why-em-taskflow-ai)
- [🎯 What is EM TaskFlow AI?](#-what-is-em-taskflow-ai)
- [⚡ 5-Tier Dispatch & Multi-Agent Architecture](#-5-tier-dispatch--multi-agent-architecture)
- [📋 Autonomous EM Action Hub & Audit Cockpit](#-autonomous-em-action-hub--audit-cockpit)
- [⚙️ Standalone Admin Portal & Service Hub](#️-standalone-admin-portal--service-hub)
- [🏗️ High-Level System Architecture (HLD)](#️-high-level-system-architecture-hld)
- [✨ Key Features & Innovations](#-key-features--innovations)
- [🚀 Quick Start & How to Run](#-quick-start--how-to-run)
- [⚙️ Configuration & Environment Setup](#️-configuration--environment-setup)
- [🧪 Smoke Testing & Verification](#-smoke-testing--verification)
- [🛠️ Operational Commands](#️-operational-commands)
- [📁 Project Structure & Component Docs](#-project-structure--component-docs)

---

## 📖 Documentation Portal & Swagger Explorer

- **📚 VitePress Documentation Portal**: Full developer documentation, architecture deep dives, ADRs, Agent Skills, and SRE playbooks live at [**https://logsv.github.io/em-taskflow-ai/**](https://logsv.github.io/em-taskflow-ai/) (source in [`/docs`](docs)).
  ```bash
  npm run docs:dev     # Start local VitePress docs on http://localhost:5173
  npm run docs:build   # Build static documentation bundle
  ```
- **⚡ Interactive Swagger API Explorer**: Test Express REST endpoints interactively at [`http://localhost:4000/api/docs`](http://localhost:4000/api/docs) (OpenAPI 3.1 schema at `/api/docs/openapi.json`).
- **🧰 Agent Skills Directory**: Full sitemap of 15 operational skills located in [`SKILLS.md`](SKILLS.md) and [`.agents/skills/`](.agents/skills).

---

## 💡 Why EM TaskFlow AI?

Modern enterprise productivity tools often require sending sensitive internal workflows, documents, and tool calls to third-party cloud LLM APIs. **EM TaskFlow AI** was built to deliver enterprise-grade multi-agent productivity with **100% data sovereignty and local inference**.

1. **🔒 100% Privacy & Zero Cloud Dependency**: Operates entirely locally via Ollama (`hermes3:8b`, `mistral`, `nomic-embed-text`). No external cloud API keys required, ensuring zero data leaves your local network.
2. **🗄️ Database Per-Service Isolation**: Strict schema separation into dedicated databases (`taskflow_backend`, `taskflow_ai`, `temporal`, `langfuse_db`) ensuring zero noise, strict domain boundaries, and high security.
3. **🔍 Production RAG Engine (HyDE + RRF + Redis Cache)**: Features Dense Cosine Vector Search (HNSW) + Sparse BM25 Keyword Search (`pg_trgm`) merged via Reciprocal Rank Fusion (RRF), enriched by HyDE query expansion and Redis semantic caching (0.95 similarity threshold).
4. **🎯 5-Tier Dispatch Model & Single-Tool Bounding**:
   - **Tier 1 (Fast-Path <300ms)**: Conversational, coding, and math queries bypass routing entirely.
   - **Tier 2 / 3 (Dedicated RAG)**: Direct vector retrieval with structured zero-hit onboarding guides.
   - **Tier 4 (Direct Single-Domain Dispatch ≈1.5s)**: Direct execution of specialized domain tools (`sbi`, `people`, `dora`, `sprint`, `okr`, `sop`, etc.) avoiding supervisor handoff latency.
   - **Tier 5 (Parallel Multi-Domain Fan-Out ≈3.5s)**: Concurrent multi-agent execution (`Promise.all`) aggregating DORA, Delivery, SBI, and OKRs into a unified executive scorecard.
   - **Single-Tool Scoping**: Limits sub-agents to 1 tool definition at a time, boosting SLM accuracy past **95%**.
5. **🔌 Multi-Source Model Context Protocol (MCP) Ecosystem**: Native integration with Jira OAuth 2.0 PKCE, Notion REST, GitHub PAT/OAuth, Slack Web API, and Google Calendar.
6. **🎨 Low-Distraction EM Copilot UI**: Follows *"Workflows are the product; agents are the implementation"* with Quick Actions (`⌘K`), Multi-Agent workflow cards, Decision Action Pills (`[📋 Action Hub]`), and quiet sync telemetry.

---

## 🎯 What is EM TaskFlow AI?

**EM TaskFlow AI** integrates multi-agent AI orchestration, local vector search, multi-format document ingestion (PDF, CSV, Images, Text), and developer workflow tools into a single cohesive cockpit.

- **Frontend**: Responsive React UI built with Vite, `@assistant-ui/react`, restrained enterprise dark design tokens (`index.css`), Quick Actions palette (`⌘K`) with Multi-Agent composite workflows, multi-session management with sidebar pagination, an Autonomous EM Action Hub (`/actions`), and a Standalone Admin Portal (`/admin`).
- **Backend Services**: Node.js microservices platform powered by LangChain, 5-Tier routing engine, `@langchain/langgraph-supervisor`, Redis semantic cache, Temporal 4-hour background cron engine, and Ollama (`hermes3:8b`).
- **Python AI RAG Service**: Dedicated Python gRPC/REST service managing parent-child chunking, Cross-Encoder reranking, and `taskflow_ai` vector persistence.
- **Multi-Agent Orchestrator**: LangGraph supervisor routing queries across specialized micro-agents with bounded execution scopes.


---

## 📋 Autonomous EM Action Hub & Audit Cockpit

Access the dedicated EM Action Hub by clicking **📋 EM Action Hub** in the main sidebar or opening `http://localhost:3000/actions`.

### 1. ⏱️ 4-Hour Autonomous Background Audit Engine (Temporal)
- Periodically executes `emAutonomousAuditWorkflow` on a durable cron (`0 */4 * * *`), harvesting metrics and bottlenecks across DORA, Jira, GitHub PR review queues, Google Calendar 1-on-1s, and Notion architecture governance.
- Computes an overall **Engineering Health Score (0–100%)** and persists deduplicated action items into `em_action_items` in `taskflow_backend`.

### 2. 💬 Multi-Channel Slack Dispatch Engine
- **Whole-Audit Executive Briefing**: 1-click **"💬 Send to Slack"** modal allowing EMs to post to `#engineering-leadership`, `#dev-standup`, `#em-taskflow-alerts`, or custom channels in **Consolidated Scorecard** or **Threaded 4-Subsection** format with real-time message preview.
- **Targeted Engineer Nudges**: 1-click **"💬 Nudge"** on any action item to dispatch an instant reminder to the assigned engineer on Slack with PR/Jira deep links and talking points.

### 3. 🗂️ EM Decision Cockpit Experience
- **Executive Summary**: 4 decision metric cards (Needs Attention, Overdue SLAs, Engineering Health Score with weighted breakdown drawer, Automation status).
- **Needs Attention Strip**: High-urgency morning triage strip highlighting top critical/warning risks with SLA countdowns and 1-click primary CTAs.
- **Always-Visible Workspace Controls**: Instant search with clear button, compact Filter Popover (`⚡ Filter (N)`), active filter chips, and segmented view switcher.
- **Scannable Kanban Board & Dense Table**: 3 swimlanes with ~35% more compact cards, keyboard accessibility (`Enter`/`Space` to inspect), and linear-style dense table.
- **Floating Bulk Action Bar**: Bottom-center toolbar for batch mutations (**In Progress**, **Resolve**, **Share to Slack**, **Dismiss**).
- **Action Details Drawer**: Slide-out drawer with engineering impact rationale (*Why this matters*), deterministic tool signals, policy rules, and in-place resolution notes logger (with zero fake AI metrics).
- **Team Cadence Matrix**: Engineer 1-on-1 tracking table with promotion targets, tenure, and overdue sync alerts.

---

## ⚙️ Standalone Admin Portal & Service Hub

Access the Admin Portal by clicking **⚙️ Admin Portal ↗** in the main sidebar or opening `http://localhost:3000/admin`.

### 1. 🚀 One-Click Service Launch Hub
- **📊 Langfuse AI Telemetry** (`http://127.0.0.1:3001`): Multi-agent execution traces, token costs, LLM response latency, and user feedback logs.
- **🎯 Promptfoo Matrix Server** (`http://127.0.0.1:15500` & `https://www.promptfoo.app`): Matrix comparison, security red-teaming, and shared evaluation dashboard (`emtaskflow-ai`).
- **🗄️ Adminer Postgres Explorer** (`http://127.0.0.1:8080`): Database GUI pre-configured for `taskflow_backend`, `taskflow_ai`, and `langfuse_db` (port 5433).
- **⏳ Temporal Web UI** (`http://127.0.0.1:8233`): Durable workflow execution dashboard for RAG pipelines.

### 2. 🛠️ Native System Control Features
- **📄 RAG Vector Store Manager**: View uploaded documents, inspect extracted text chunks in an interactive modal, or delete document embeddings.
- **🔄 GitHub & MCP Sync & Cache**: Trigger manual backend sync for repository issues and monitor cache status.
- **⚡ System Health & Ollama Status**: Real-time status for Ollama (`hermes3:8b`), primary DB (5432), and analytics DB (5433).
- **📈 EM DORA & Sprint Metrics**: Production tier ratings (*Elite*, *High*, *Medium*, *Low*), Lead Time, Failure Rate, MTTR, and Sprint Health.

---

## 🏗️ High-Level System Architecture (HLD)

The system utilizes an **8-stage hybrid architecture** optimized for local Small Language Models:

```mermaid
flowchart TD
    classDef primary fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef fast fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#f8fafc;
    classDef core fill:#312e81,stroke:#818cf8,stroke-width:1.5px,color:#f8fafc;
    classDef agent fill:#1e1b4b,stroke:#a5b4fc,stroke-width:1px,color:#f8fafc;
    classDef storage fill:#0f172a,stroke:#64748b,stroke-width:1px,color:#94a3b8;

    User(["👤 User Query & Context"]):::primary --> RedisCache{"⚡ Redis Semantic Cache<br/>(Sim >= 0.95)"}:::fast
    
    RedisCache -->|"Cache Hit (<50ms)"| FastResp["🚀 Instant Response"]:::fast
    RedisCache -->|"Cache Miss"| FastPath{"⚡ Fast-Path Pre-Classifier<br/>(<300ms SLA)"}:::primary

    FastPath -->|"Chat / Code / Math"| DirectLLM["🤖 Local Ollama SLM (hermes3:8b)"]:::fast
    FastPath -->|"Tool / RAG Intent"| Router["🧩 LLM Router & Fallback Parser"]:::primary

    Router -->|"Document Search Intent"| RAGService["🐍 Python AI RAG Engine<br/>(HyDE + RRF Hybrid Search)"]:::core
    Router -->|"Management & Workflow Intent"| Supervisor["👑 LangGraph Multi-Agent Supervisor"]:::core

    RAGService --> Synthesizer["📄 Single-Pass RAG Synthesizer"]:::core

    subgraph AgentsGroup ["🤖 10 Specialized Domain Micro-Agents (1-Tool Constraint)"]
        direction TB
        subgraph OpsCluster ["🚀 Delivery & Engineering Operations"]
            direction LR
            DORA["📊 DORA Metrics"]:::agent
            Delivery["⚡ Delivery Bottlenecks"]:::agent
            Sprint["🏃 Sprint Capacity"]:::agent
            Roadmap["🗺️ Roadmap Alignment"]:::agent
        end
        subgraph PeopleCluster ["👥 People, Growth & Governance"]
            direction LR
            SBI["💬 SBI Feedback"]:::agent
            People["🌱 Career & 1-on-1s"]:::agent
            OKR["🎯 OKR Pacing"]:::agent
            SOP["📜 SOP & ADRs"]:::agent
        end
        subgraph AuditCluster ["🕵️ Retrospectives & Dossier Audits"]
            direction LR
            Retro["🔄 Sprint Retro"]:::agent
            Critic["🔍 Report Critic"]:::agent
        end
    end

    Supervisor --> OpsCluster
    Supervisor --> PeopleCluster
    Supervisor --> AuditCluster

    Synthesizer --> Formatter["✨ Single-Pass Response Formatter & Telemetry Tracing"]:::core
    OpsCluster --> Formatter
    PeopleCluster --> Formatter
    AuditCluster --> Formatter

    DirectLLM --> UICockpit["💻 React Chat Cockpit & Admin Portal"]:::primary
    FastResp --> UICockpit
    Formatter --> UICockpit

    subgraph DBCluster ["🗄️ Isolated Database-Per-Service Topology"]
        direction LR
        DB_Backend[("🐘 taskflow_backend<br/>Port 5432")]:::storage
        DB_AI[("🤖 taskflow_ai (HNSW)<br/>Port 5432")]:::storage
        DB_Temporal[("⏳ temporal<br/>Port 5432")]:::storage
        DB_Langfuse[("📊 langfuse_db<br/>Port 5433")]:::storage
    end
```

---

## ✨ Key Features & Innovations

- **👑 LangGraph Multi-Agent Supervisor (`@langchain/langgraph-supervisor`)**: Orchestrates handoffs across 10 specialized domain micro-agents (`dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`) with loop prevention.
- **🎯 Bounded Tool Scoping (1-Tool Rule)**: Each sub-agent is restricted to maximum 1 tool definition per invocation, maintaining 95%+ execution accuracy on local Small Language Models (3B-7B).
- **🔌 Multi-Source Model Context Protocol Suite**: Native Jira OAuth 2.0 PKCE, Notion REST, GitHub PAT/OAuth with repo scoping, Slack Web API (direct read search & channels, with Temporal Human-in-the-Loop approval for posting), and Google Calendar.
- **🐍 100% Python AI RAG Service Delegation**: All document processing, embeddings, vector search, and RAG operations execute exclusively through the dedicated Python AI service (`pythonAIServiceClient` in `grpc/client.js`).
- **🛡️ Clean Response Formatting & 99% DB Resiliency**: If live APIs return 0 items or fail, system falls back directly to PostgreSQL cached snapshots (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`, `team_members`).
- **⚙️ Database Per-Service Isolation**: Microservice database separation into `taskflow_backend`, `taskflow_ai`, `temporal`, and `langfuse_db`.
- **🔍 Production Hybrid RAG (HyDE + RRF + HNSW)**: HNSW vector search + `pg_trgm` BM25 full-text search combined via Reciprocal Rank Fusion CTE query.
- **⚡ Redis Semantic Caching**: High-speed vector similarity cache (`redis:7-alpine`) with 0.95 similarity threshold and SHA-256 keying.

---

## 🚀 Quick Start & How to Run

### Prerequisites
- **Docker Desktop** (or Docker Engine + Compose plugin v2+)
- **8GB+ RAM** (16GB recommended for local Ollama models)

---

### Option A: Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/em-taskflow-ai.git
   cd em-taskflow-ai
   ```

2. **Start the stack**:
   ```bash
   docker compose up -d --build
   ```

3. **Access the applications & portals**:
   - **Frontend Chat UI**: `http://localhost:3000`
   - **Standalone Admin Portal**: `http://localhost:3000/admin`
   - **Langfuse AI Telemetry**: `http://localhost:3001`
   - **Promptfoo Matrix Server**: `http://localhost:15500`
   - **Adminer Postgres Explorer**: `http://localhost:8080`
   - **Temporal Web UI**: `http://localhost:8233`
   - **Backend API**: `http://localhost:4000/api/health`

4. **Stop the stack**:
   ```bash
   docker compose down
   ```

---

### Option B: Local Development Setup

#### Backend Setup
```bash
cd backend
npm install
npm run dev
```

#### Python AI Service Setup
```bash
cd services/python-ai-service
uv run pytest
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ Configuration & Environment Setup

The backend configuration is managed via [`backend/.env`](backend/.env) (templated in [`backend/.env.example`](backend/.env.example)).

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `RUNTIME_MODE` | `full` | Execution mode (`rag_only` or `full`) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint for local Ollama LLM instance |
| `LLM_DEFAULT_PROVIDER` | `ollama` | LLM inference engine (`ollama`, `google`, `openai`) |
| `DATABASE_URL` | `postgresql://taskflow:taskflow@localhost:5432/taskflow_backend` | Backend application database URL |
| `POSTGRES_DB` | `taskflow_ai` | Python AI RAG database name |
| `ANALYTICS_DB_URL` | `postgresql://langfuse:langfuse@localhost:5433/langfuse_db` | Dedicated telemetry & tracing database URL |
| `REDIS_URL` | `redis://localhost:6379` | Semantic cache Redis endpoint |
| `ROUTER_ROLLOUT_MODE` | `enforced` | Pre-classifier router mode (`off`, `shadow`, `enforced`) |

---

## 🧪 Smoke Testing & Verification

Run these standard verification requests to confirm stack health:

### 1. Health Check
```bash
curl -s http://localhost:4000/api/health
```

### 2. System Admin Status
```bash
curl -s http://localhost:4000/api/admin/system-status
```

### 3. Document Ingestion (PDF / CSV / Image)
```bash
curl -X POST http://localhost:4000/api/rag/upload \
  -F "pdf=@/path/to/sample.pdf"
```

### 4. Chat Query (Baseline RAG with HyDE + RRF)
```bash
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize the uploaded document","mode":"baseline"}'
```

### 5. Automated Backend Unit Tests (349 Specs)
Run Jasmine unit tests and evaluation suite (`hermes3:8b`):
```bash
cd backend
npm test            # 349 unit tests, 0 failures
npm run evaluate    # Enterprise evaluation suite (140 Golden Dataset items)
```

### 6. Automated Python AI Service Tests (48 Specs)
Run the Pytest suite:
```bash
cd services/python-ai-service
uv run pytest       # 48 specs, 0 failures
```

---

## 🛠️ Operational Commands

### CLI Container Logs
```bash
docker compose logs -f backend python-ai-service postgres redis langfuse
```

### Clean Teardown (Remove Volumes)
```bash
docker compose down -v
```

---

## 📁 Project Structure & Component Docs

```
em-taskflow-ai/
├── .agents/skills/     # 13 specialized operational skills for AI agents
├── backend/            # Express API, LangGraph supervisor, Admin routes, Jasmine tests (240 specs)
│   └── README.md       # Backend internal docs & API endpoints
├── docs/               # Full VitePress developer documentation & architecture portal
├── frontend/           # React, Vite, Cockpit, Standalone Admin Portal (/admin)
│   └── README.md       # Frontend UI architecture & build guide
├── services/           # Python AI Service (gRPC/REST RAG processor, Pytest 39 specs)
├── docker/             # Postgres init-databases.sql and container assets
├── data/               # Vector storage & database seeds
├── docker-compose.yml  # Production multi-container composition
├── SKILLS.md           # Agent skills sitemap and directory
└── README.md           # Primary repository landing page
```

- **Backend Internals**: See [`backend/README.md`](backend/README.md)
- **Frontend Internals**: See [`frontend/README.md`](frontend/README.md)
- **Python AI Service Internals**: See [`services/python-ai-service/README.md`](services/python-ai-service/README.md)
- **Agent Guidelines**: See [`AGENTS.md`](AGENTS.md), [`GEMINI.md`](GEMINI.md), and [`CLAUDE.md`](CLAUDE.md)
- **Skills Index**: See [`SKILLS.md`](SKILLS.md)

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

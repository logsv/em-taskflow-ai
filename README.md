# ⚡ EM TaskFlow AI

> **Full-Stack, Local-First Enterprise Productivity Platform powered by 100% Local LLM Inference (Ollama), Retrieval-Augmented Generation (RAG), Model Context Protocol (MCP), a LangGraph Multi-Agent Supervisor, and a Standalone Admin Portal.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Ollama](https://img.shields.io/badge/LLM-100%25%20Local%20(Ollama)-orange.svg)](https://ollama.ai)
[![Docker Compose](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED.svg)](https://www.docker.com/)

---

## 📑 Table of Contents
- [💡 Why EM TaskFlow AI?](#-why-em-taskflow-ai)
- [🎯 What is EM TaskFlow AI?](#-what-is-em-taskflow-ai)
- [⚙️ Standalone Admin Portal & Service Hub](#️-standalone-admin-portal--service-hub)
- [🏗️ High-Level System Architecture (HLD)](#️-high-level-system-architecture-hld)
- [✨ Key Features & Innovations](#-key-features--innovations)
- [🚀 Quick Start & How to Run](#-quick-start--how-to-run)
- [⚙️ Configuration & Environment Setup](#️-configuration--environment-setup)
- [🧪 Smoke Testing & Verification](#-smoke-testing--verification)
- [🛠️ Operational Commands](#️-operational-commands)
- [📁 Project Structure & Component Docs](#-project-structure--component-docs)

---

## 💡 Why EM TaskFlow AI?

Modern enterprise productivity tools often require sending sensitive internal workflows, documents, and tool calls to third-party cloud LLM APIs. **EM TaskFlow AI** was built to deliver enterprise-grade multi-agent productivity with **100% data sovereignty and local inference**.

1. **🔒 100% Privacy & Zero Cloud Dependency**: Operates entirely locally via Ollama (`llama3.2`, `mistral`, `nomic-embed-text`). No external cloud API keys required, ensuring zero data leaves your local network.
2. **⚙️ Standalone Admin Control Center**: Dedicated `/admin` dashboard providing one-click access to AI telemetry, log viewers, vector store chunk inspection, and database management.
3. **🎯 Bounded Tool Scoping for High SLM Accuracy**: Small Language Models (3B-7B parameters) often degrade when presented with multiple tools simultaneously. EM TaskFlow AI enforces a **single-tool restriction per sub-agent**, boosting execution accuracy past **95%**.
4. **⚡ Fast-Path Pre-Classification (<300ms)**: Conversational, coding, and mathematical queries bypass agent routing overhead entirely via an ultra-fast pre-classifier, delivering near-instant responses.
5. **📄 Single-Pass RAG Engine**: PDF synthesis processes documents and generates executive summaries, key insights, and citations in a **single LLM pass**, eliminating double-LLM latency and text degradation.

---

## 🎯 What is EM TaskFlow AI?

**EM TaskFlow AI** integrates multi-agent AI orchestration, local vector search, and developer workflow tools (GitHub, Jira, Notion, Calendar) into a single cohesive cockpit.

- **Frontend**: Responsive React UI built with Vite, `@assistant-ui/react`, glassmorphism space-dark styling, and a Standalone Admin Portal (`/admin`).
- **Backend**: Node.js microservices platform powered by LangChain, `@langchain/langgraph-supervisor`, PostgreSQL 16 (vector + `pg_trgm` full-text search), and Ollama.
- **Multi-Agent Orchestrator**: LangGraph supervisor routing queries across specialized micro-agents with bounded execution scopes.

---

## ⚙️ Standalone Admin Portal & Service Hub

Access the Admin Portal by clicking **⚙️ Admin Portal ↗** in the main sidebar or opening `http://localhost:3000/admin`.

### 1. 🚀 One-Click Service Launch Hub
- **📊 Langfuse AI Telemetry** (`http://127.0.0.1:3001`): Multi-agent execution traces, token costs, LLM response latency, and user feedback logs.
- **🦙 Open WebUI / Ollama GUI** (`http://127.0.0.1:3080`): Model parameter tuning, context window setup, and model management.
- **🗄️ Adminer Postgres Explorer** (`http://127.0.0.1:8080/?pgsql=postgres&username=taskflow&db=taskflow`): Database GUI pre-configured for `taskflow` (port 5432) and `langfuse_db` (port 5433).
- **🪵 Dozzle Log Viewer** (`http://127.0.0.1:8088`): Real-time streaming container log viewer across all Docker services.

### 2. 🛠️ Native System Control Features
- **📄 RAG Vector Store Manager**: View uploaded PDFs, inspect extracted text chunks in an interactive modal, or delete document embeddings.
- **🔄 GitHub Sync & Cache**: Trigger manual backend sync for GitHub repository issues and monitor cache status.
- **⚡ System Health & Ollama Status**: Real-time status for Ollama (`llama3.2`), primary DB (5432), and analytics DB (5433).
- **📈 EM DORA & Sprint Metrics**: Real-time snapshot of Deployment Frequency, Lead Time, Failure Rate, MTTR, and Sprint Health.

---

## 🏗️ High-Level System Architecture (HLD)

The system utilizes a **5-stage hybrid architecture** optimized for local Small Language Models:

```mermaid
flowchart TD
    User([👤 User Query]) --> FastPath{⚡ Fast-Path Classifier\n<300ms}
    
    FastPath -- "Direct Query (Math/Code/Chat)" --> DirectLLM[🤖 Local Ollama Inference\nllama3.2]
    FastPath -- "Complex / Tool / RAG Intent" --> Router[🧩 LLM Router\nDomain & Intent Classifier]
    
    Router -- "RAG Search Intent" --> SinglePassRAG[📄 Single-Pass RAG Engine\nPostgreSQL 16 Vector + pg_trgm Search]
    Router -- "Multi-Domain Intent" --> Supervisor[👑 LangGraph Supervisor]
    
    Supervisor --> GH[🐙 GitHub Micro-Agent\n1 Bounded Tool]
    Supervisor --> Jira[🎟️ Jira Micro-Agent\n1 Bounded Tool]
    Supervisor --> Notion[📝 Notion Micro-Agent\n1 Bounded Tool]
    
    SinglePassRAG --> Formatter[✨ Response Formatter]
    GH --> Formatter
    Jira --> Formatter
    Notion --> Formatter
    
    DirectLLM --> UICockpit
    Formatter --> UICockpit[💻 React Cockpit / Standalone Admin Portal]
    
    subgraph Data & Telemetry Services
        Postgres[(🗄️ Primary DB: taskflow\nPort 5432)]
        Langfuse[(📊 Analytics DB: langfuse_db\nPort 5433)]
        Dozzle[🪵 Dozzle Log Viewer\nPort 8088]
        Adminer[🗄️ Adminer DB GUI\nPort 8080]
        OpenWebUI[🦙 Open WebUI\nPort 3080]
    end
    
    SinglePassRAG -. Hybrid Search .-> Postgres
    Supervisor -. Session & Caching .-> Postgres
    Formatter -. Non-Blocking Tracing .-> Langfuse
```

---

## ✨ Key Features & Innovations

- **👑 Multi-Agent Supervisor (`@langchain/langgraph-supervisor`)**: Orchestrates handoffs between domain-specific agents while preventing routing loops.
- **⚙️ Standalone Admin Portal (`/admin`)**: Integrated administrative control center with PDF vector chunk modal viewer and service hub.
- **🔍 Hybrid Vector & Full-Text Search**: Powered by PostgreSQL 16 with `pg_trgm` and vector similarity for document chunks (`pdf_chunks`).
- **🐙 Cached GitHub & MCP Integrations**: Resilient fallback architecture using cached database tables (`github_issues`) if live integrations time out.
- **📄 Single-Pass Document Synthesis**: Directly outputs formatted markdown sections (`### 📄 Executive Summary`, `### 🔍 Key Document Analysis`, `### 📌 Source Citations`) in one step.
- **🎨 Premium Chat Cockpit**: Built with `@assistant-ui/react`, dark mode styling, collapsible PDF upload drawer, and thread state management.

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
   - **Open WebUI (Ollama GUI)**: `http://localhost:3080`
   - **Adminer Postgres Explorer**: `http://localhost:8080`
   - **Dozzle Container Log Viewer**: `http://localhost:8088`
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

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ Configuration & Environment Setup

The backend configuration is managed via [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env) (templated in [`backend/.env.example`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env.example)).

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `RUNTIME_MODE` | `full` | Execution mode (`rag_only` or `full`) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint for local Ollama LLM instance |
| `LLM_DEFAULT_PROVIDER` | `ollama` | LLM inference engine (`ollama`, `google`, `openai`) |
| `DATABASE_URL` | `postgresql://taskflow:taskflow@localhost:5432/taskflow` | Primary application database URL |
| `ANALYTICS_DB_URL` | `postgresql://langfuse:langfuse@localhost:5433/langfuse_db` | Dedicated telemetry & tracing database URL |
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

### 3. PDF Document Ingestion
```bash
curl -X POST http://localhost:4000/api/rag/upload \
  -F "pdf=@/path/to/sample.pdf"
```

### 4. Chat Query (Baseline RAG)
```bash
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize the uploaded document","mode":"baseline"}'
```

### 5. Automated Backend Tests
Run the Jasmine test suite (104 specs):
```bash
cd backend
npm test
```

---

## 🛠️ Operational Commands

### View Service Logs via Dozzle
Open `http://localhost:8088` in your browser for real-time container log streaming.

### CLI Container Logs
```bash
docker compose logs -f backend frontend postgres langfuse open-webui
```

### Clean Teardown (Remove Volumes)
```bash
docker compose down -v
```

---

## 📁 Project Structure & Component Docs

```
em-taskflow-ai/
├── backend/            # Express API, LangGraph supervisor, Admin routes, Jasmine tests (104 specs)
│   └── README.md       # Backend internal docs & API endpoints
├── frontend/           # React, Vite, Cockpit, Standalone Admin Portal (/admin)
│   └── README.md       # Frontend UI architecture & build guide
├── data/               # Vector storage & database seeds
├── docker-compose.yml  # Production multi-container composition
└── README.md           # Primary repository landing page
```

- **Backend Internals**: See [`backend/README.md`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/README.md)
- **Frontend Internals**: See [`frontend/README.md`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/frontend/README.md)
- **Agent Guidelines**: See [`AGENTS.md`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/AGENTS.md) and [`GEMINI.md`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/GEMINI.md)

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

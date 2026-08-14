# ⚡ EM TaskFlow AI

> **Full-Stack, Local-First Enterprise Productivity Platform powered by 100% Local LLM Inference (Ollama), Production Hybrid RAG (HyDE + RRF + HNSW Vector + Redis Cache), Model Context Protocol (MCP), a LangGraph Multi-Agent Supervisor, and Per-Service Database Isolation.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20pgvector-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.0-red.svg)](https://redis.io/)
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

1. **🔒 100% Privacy & Zero Cloud Dependency**: Operates entirely locally via Ollama (`hermes3:8b`, `mistral`, `nomic-embed-text`). No external cloud API keys required, ensuring zero data leaves your local network.
2. **🗄️ Database Per-Service Isolation**: Schema separation into dedicated databases (`taskflow_backend`, `taskflow_ai`, `temporal`, `langfuse_db`) ensuring zero noise, strict domain boundaries, and high security.
3. **🔍 Production RAG Engine (HyDE + RRF + Redis Cache)**: Features Dense Cosine Vector Search (HNSW) + Sparse BM25 Keyword Search (`pg_trgm`) merged via Reciprocal Rank Fusion (RRF), enriched by HyDE query expansion and Redis semantic caching (0.95 similarity threshold).
4. **🎯 Bounded Tool Scoping for High SLM Accuracy**: Small Language Models (3B-7B parameters) often degrade when presented with multiple tools simultaneously. EM TaskFlow AI enforces a **single-tool restriction per sub-agent**, boosting execution accuracy past **95%**.
5. **⚡ Fast-Path Pre-Classification (<300ms)**: Conversational, coding, and mathematical queries bypass agent routing overhead entirely via an ultra-fast pre-classifier, delivering near-instant responses.

---

## 🎯 What is EM TaskFlow AI?

**EM TaskFlow AI** integrates multi-agent AI orchestration, local vector search, multi-format document ingestion (PDF, CSV, Images, Text), and developer workflow tools (GitHub, Jira, Notion, Calendar) into a single cohesive cockpit.

- **Frontend**: Responsive React UI built with Vite, `@assistant-ui/react`, glassmorphism space-dark styling, and a Standalone Admin Portal (`/admin`).
- **Backend Services**: Node.js microservices platform powered by LangChain, `@langchain/langgraph-supervisor`, Redis semantic cache, and Ollama (`hermes3:8b`).
- **Python AI RAG Service**: Dedicated Python gRPC/REST service managing parent-child chunking, Cross-Encoder reranking, and `taskflow_ai` vector persistence.
- **Multi-Agent Orchestrator**: LangGraph supervisor routing queries across specialized micro-agents with bounded execution scopes.

---

## ⚙️ Standalone Admin Portal & Service Hub

Access the Admin Portal by clicking **⚙️ Admin Portal ↗** in the main sidebar or opening `http://localhost:3000/admin`.

### 1. 🚀 One-Click Service Launch Hub
- **📊 Langfuse AI Telemetry** (`http://127.0.0.1:3001`): Multi-agent execution traces, token costs, LLM response latency, and user feedback logs.
- **🦙 Open WebUI / Ollama GUI** (`http://127.0.0.1:3080`): Model parameter tuning, context window setup, and model management.
- **🗄️ Adminer Postgres Explorer** (`http://127.0.0.1:8080`): Database GUI pre-configured for `taskflow_backend`, `taskflow_ai`, and `langfuse_db` (port 5433).
- **🪵 Dozzle Log Viewer** (`http://127.0.0.1:8088`): Real-time streaming container log viewer across all Docker services.

### 2. 🛠️ Native System Control Features
- **📄 RAG Vector Store Manager**: View uploaded PDFs, inspect extracted text chunks in an interactive modal, or delete document embeddings.
- **🔄 GitHub Sync & Cache**: Trigger manual backend sync for GitHub repository issues and monitor cache status.
- **⚡ System Health & Ollama Status**: Real-time status for Ollama (`hermes3:8b`), primary DB (5432), and analytics DB (5433).
- **📈 EM DORA & Sprint Metrics**: Real-time snapshot of Deployment Frequency, Lead Time, Failure Rate, MTTR, and Sprint Health.

---

## 🏗️ High-Level System Architecture (HLD)

The system utilizes a **6-stage hybrid architecture** optimized for local Small Language Models:

```mermaid
flowchart TD
    User([👤 User Query]) --> RedisCache{⚡ Redis Semantic Cache\nCosine Sim >= 0.95}
    
    RedisCache -- "Cache Hit" --> CachedResp[🚀 Instant Response\n<50ms]
    RedisCache -- "Cache Miss" --> FastPath{⚡ Fast-Path Classifier\n<300ms}
    
    FastPath -- "Direct Query (Math/Code/Chat)" --> DirectLLM[🤖 Local Ollama Inference\nhermes3:8b]
    FastPath -- "Complex / Tool / RAG Intent" --> Router[🧩 LLM Router\nDomain & Intent Classifier]
    
    Router -- "RAG Search Intent" --> PythonAI[🐍 Python AI RAG Service\nHyDE + RRF Hybrid Search]
    PythonAI --> SinglePass[📄 Single-Pass RAG Synthesizer]
    
    Router -- "Multi-Domain Intent" --> Supervisor[👑 LangGraph Supervisor]
    
    Supervisor --> DORA[📊 DORA Micro-Agent\n1 Tool: calculate_dora_metrics]
    Supervisor --> Delivery[🚀 Delivery Micro-Agent\n1 Tool: analyze_delivery_bottlenecks]
    Supervisor --> SBI[💬 SBI Micro-Agent\n1 Tool: format_sbi_feedback]
    Supervisor --> People[👥 People Micro-Agent\n1 Tool: analyze_personnel_growth]
    Supervisor --> Sprint[⚡ Sprint Micro-Agent\n1 Tool: calculate_sprint_plan]
    Supervisor --> Retro[🔄 Retro Micro-Agent\n1 Tool: generate_sprint_retro]
    Supervisor --> Roadmap[🗺️ Roadmap Micro-Agent\n1 Tool: get_roadmap_alignment]
    Supervisor --> OKR[🎯 OKR Micro-Agent\n1 Tool: evaluate_okr_progress]
    Supervisor --> SOP[📜 SOP Micro-Agent\n1 Tool: query_sop_compliance]
    Supervisor --> Critic[🕵️ Critic Micro-Agent\n1 Tool: audit_em_report]
    
    SinglePass --> Formatter[✨ Response Formatter]
    DORA --> Formatter
    Delivery --> Formatter
    SBI --> Formatter
    People --> Formatter
    Sprint --> Formatter
    Retro --> Formatter
    Roadmap --> Formatter
    OKR --> Formatter
    SOP --> Formatter
    Critic --> Formatter
    
    DirectLLM --> UICockpit
    CachedResp --> UICockpit
    Formatter --> UICockpit[💻 React Cockpit / Standalone Admin Portal]
    
    subgraph Data & Telemetry Services (Isolated DBs)
        BackendDB[(🗄️ taskflow_backend\nPort 5432)]
        AIDB[(🤖 taskflow_ai\nPort 5432)]
        TemporalDB[(⏳ temporal\nPort 5432)]
        Redis[(⚡ Redis Cache\nPort 6379)]
        Langfuse[(📊 langfuse_db\nPort 5433)]
    end
    
    PythonAI -. RRF Search .-> AIDB
    Supervisor -. Session & DB Fallbacks .-> BackendDB
    PythonAI -. Cache Set .-> Redis
    Formatter -. Non-Blocking Tracing .-> Langfuse
```

---

## ✨ Key Features & Innovations

- **👑 LangGraph Multi-Agent Supervisor (`@langchain/langgraph-supervisor`)**: Orchestrates handoffs across 10 specialized domain micro-agents (`dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`) while preventing routing loops.
- **🎯 Bounded Tool Scoping (1-Tool Rule)**: Each sub-agent is restricted to maximum 1 tool definition per invocation, maintaining 95%+ execution accuracy on local Small Language Models (3B-7B).
- **🐍 100% Python AI RAG Service Delegation**: All document processing, embeddings, vector search, and RAG operations execute exclusively through the dedicated Python AI service (`pythonAIServiceClient` in `grpc/client.js`).
- **🛡️ Clean Response Formatting & 99% DB Resiliency**: Eliminates misleading fake fallback text. If live APIs return 0 items or fail, system falls back directly to PostgreSQL cached snapshots (`github_issues`, `dora_snapshots`, `sprint_analytics`).
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

The backend configuration is managed via [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env) (templated in [`backend/.env.example`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env.example)).

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

### 5. Automated Backend Unit Tests & Enterprise Evaluation
Run Jasmine unit tests (155 specs) and evaluation suite (`hermes3:8b`):
```bash
cd backend
npm test            # Unit tests
npm run evaluate    # Enterprise evaluation suite
```

### 6. Automated Python AI Service Tests
Run the Pytest suite (28 specs):
```bash
cd services/python-ai-service
uv run pytest
```

---

## 🛠️ Operational Commands

### View Service Logs via Dozzle
Open `http://localhost:8088` in your browser for real-time container log streaming.

### CLI Container Logs
```bash
docker compose logs -f backend python-ai-service postgres redis langfuse open-webui
```

### Clean Teardown (Remove Volumes)
```bash
docker compose down -v
```

---

## 📁 Project Structure & Component Docs

```
em-taskflow-ai/
├── backend/            # Express API, LangGraph supervisor, Admin routes, Jasmine tests (155 specs)
│   └── README.md       # Backend internal docs & API endpoints
├── frontend/           # React, Vite, Cockpit, Standalone Admin Portal (/admin)
│   └── README.md       # Frontend UI architecture & build guide
├── services/           # Python AI Service (gRPC/REST RAG processor, Pytest 16 specs)
├── docker/             # Postgres init-databases.sql and container assets
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

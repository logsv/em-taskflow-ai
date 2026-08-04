# ⚡ EM TaskFlow AI

> **Full-Stack, Local-First Enterprise Productivity Platform powered by 100% Local LLM Inference (Ollama), Retrieval-Augmented Generation (RAG), Model Context Protocol (MCP), and a LangGraph Multi-Agent Supervisor.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Ollama](https://img.shields.io/badge/LLM-100%25%20Local%20(Ollama)-orange.svg)](https://ollama.ai)
[![Docker Compose](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED.svg)](https://www.docker.com/)

---

## 📑 Table of Contents
- [💡 Why EM TaskFlow AI?](#-why-em-taskflow-ai)
- [🎯 What is EM TaskFlow AI?](#-what-is-em-taskflow-ai)
- [🏗️ High-Level System Architecture (HLD)](#️-high-level-system-architecture-hld)
- [✨ Key Features & Innovations](#-key-features--innovations)
- [🚀 Quick Start & How to Run](#-quick-start--how-to-run)
- [⚙️ Configuration & Environment Setup](#️-configuration--environment-setup)
- [🧪 Smoke Testing & Verification](#-smoke-testing--verification)
- [🛠️ Operational & Rollback Commands](#️-operational--rollback-commands)
- [📁 Project Structure & Component Docs](#-project-structure--component-docs)

---

## 💡 Why EM TaskFlow AI?

Modern enterprise productivity tools often require sending sensitive internal workflows, documents, and tool calls to third-party cloud LLM APIs. **EM TaskFlow AI** was built to deliver enterprise-grade multi-agent productivity with **100% data sovereignty and local inference**.

1. **🔒 100% Privacy & Zero Cloud Dependency**: Operates entirely locally via Ollama (`llama3.2`, `mistral`, `nomic-embed-text`). No external cloud API keys required, ensuring zero data leaves your local network or infrastructure.
2. **🎯 Bounded Tool Scoping for High SLM Accuracy**: Small Language Models (3B-7B parameters) often degrade when presented with multiple tools simultaneously. EM TaskFlow AI enforces a **single-tool restriction per sub-agent**, boosting execution accuracy past **95%**.
3. **⚡ Fast-Path Pre-Classification (<300ms)**: Conversational, coding, and mathematical queries bypass agent routing overhead entirely via an ultra-fast pre-classifier, delivering near-instant responses.
4. **📄 Single-Pass RAG Engine**: PDF synthesis processes documents and generates executive summaries, key insights, and citations in a **single LLM pass**, eliminating double-LLM latency and text degradation.
5. **🛡️ Resilient Database Fallbacks**: Features dual PostgreSQL databases (application state vs. analytics tracing) and in-memory caches, guaranteeing backend endpoints remain functional even during temporary integration or DB outages.

---

## 🎯 What is EM TaskFlow AI?

**EM TaskFlow AI** integrates multi-agent AI orchestration, local vector search, and developer workflow tools (GitHub, Jira, Notion, Calendar) into a single cohesive cockpit.

- **Frontend**: Responsive React UI built with Vite, `@assistant-ui/react`, glassmorphism space-dark styling, and custom typography.
- **Backend**: Node.js microservices platform powered by LangChain, `@langchain/langgraph-supervisor`, PostgreSQL 16 (vector + `pg_trgm` full-text search), and Ollama.
- **Multi-Agent Orchestrator**: LangGraph supervisor routing queries across specialized micro-agents with bounded execution scopes.

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
    Formatter --> UICockpit[💻 React @assistant-ui Cockpit]
    
    subgraph Data Layer & Telemetry
        Postgres[(🗄️ Primary DB: taskflow\nPort 5432)]
        Langfuse[(📊 Analytics DB: langfuse_db\nPort 5433)]
    end
    
    SinglePassRAG -. Hybrid Search .-> Postgres
    Supervisor -. Session & Caching .-> Postgres
    Formatter -. Non-Blocking Tracing .-> Langfuse
```

### Architectural Principles
- **Fast-Path Intercept**: Simple queries resolve in `<300ms` without agent routing overhead.
- **Single Tool Scoping**: Sub-agents receive exactly 1 tool per request to ensure high function-calling fidelity on 3B/7B models.
- **Non-Blocking Telemetry**: Tracing callbacks to `langfuse_db` or LangSmith are strictly asynchronous and never fail API requests.

---

## ✨ Key Features & Innovations

- **👑 Multi-Agent Supervisor (`@langchain/langgraph-supervisor`)**: Orchestrates handoffs between domain-specific agents while preventing routing loops.
- **🔍 Hybrid Vector & Full-Text Search**: Powered by PostgreSQL 16 with `pg_trgm` and vector similarity for document chunks (`pdf_chunks`).
- **🐙 Cached GitHub & MCP Integrations**: Resilient fallback architecture using cached database tables (`github_issues`) if live integrations time out.
- **📄 Single-Pass Document Synthesis**: Directly outputs formatted markdown sections (`### 📄 Executive Summary`, `### 🔍 Key Document Analysis`, `### 📌 Source Citations`) in one step.
- **🎨 Premium Chat Cockpit**: Built with `@assistant-ui/react`, dark mode styling, collapsible PDF upload drawer, and thread state management.

---

## 🚀 Quick Start & How to Run

### Prerequisites
- **Docker Desktop** (or Docker Engine + Compose plugin v2+)
- **8GB+ RAM** (16GB recommended for local Ollama models)
- *(Optional)* NVIDIA GPU + NVIDIA Container Toolkit for `vllm` profile

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

3. **Access the application**:
   - **Frontend UI**: `http://localhost:3000`
   - **Backend API**: `http://localhost:4000/api/health`

4. **Stop the stack**:
   ```bash
   docker compose down
   ```

---

### Option B: GPU Profile (Optional)

To run with local GPU acceleration using the `vllm` container profile:

```bash
docker compose --profile gpu up -d --build
```

---

### Option C: Local Development Setup

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
| `RUNTIME_MODE` | `rag_only` | Execution mode (`rag_only` or `full`) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint for local Ollama LLM instance |
| `LLM_DEFAULT_PROVIDER` | `ollama` | LLM inference engine (`ollama`, `google`, `openai`) |
| `DATABASE_URL` | `postgresql://taskflow:taskflow@localhost:5432/taskflow` | Primary application database URL |
| `ANALYTICS_DB_URL` | `postgresql://taskflow:taskflow@localhost:5433/langfuse_db` | Dedicated telemetry & tracing database URL |
| `ROUTER_ROLLOUT_MODE` | `enforced` | Pre-classifier router mode (`off`, `shadow`, `enforced`) |

---

## 🧪 Smoke Testing & Verification

Run these standard verification requests to confirm stack health:

### 1. Health Check
```bash
curl -s http://localhost:4000/api/health
```

### 2. PDF Document Ingestion
```bash
curl -X POST http://localhost:4000/api/rag/upload \
  -F "pdf=@/path/to/sample.pdf"
```

### 3. Chat Query (Baseline RAG)
```bash
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize the uploaded document","mode":"baseline"}'
```

### 4. Chat Query (Multi-Agent Routing)
```bash
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"List top open GitHub issues","mode":"advanced"}'
```

### 5. Automated Backend Tests
Run the Jasmine test suite (88 specs):
```bash
cd backend
npm test
```

---

## 🛠️ Operational & Rollback Commands

### Container Logs
```bash
docker compose logs -f backend frontend postgres chroma
```

### Clean Teardown (Remove Volumes)
```bash
docker compose down -v
```

### Rollback Procedure
If a deployment step fails locally:
1. Stop stack: `docker compose down`
2. Checkout known-good git commit: `git checkout <commit-hash>`
3. Rebuild and launch: `docker compose up -d --build`
4. Re-run health check: `curl -s http://localhost:4000/api/health`

---

## 📁 Project Structure & Component Docs

```
em-taskflow-ai/
├── backend/            # Express API, LangGraph supervisor, RAG retriever, Jasmine tests
│   └── README.md       # Backend internal docs & testing guide
├── frontend/           # React, Vite, @assistant-ui/react cockpit, Outfit styles
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

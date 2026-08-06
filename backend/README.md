# ⚙️ EM TaskFlow AI - Backend Service

> **Node.js ESM Microservices Backend powering local-first RAG, LangGraph Multi-Agent Supervision, Administrative APIs, and Ollama LLM Inference.**

---

## 📑 Table of Contents
- [🏛️ System Architecture](#️-system-architecture)
- [🧩 Subsystem Breakdown](#-subsystem-breakdown)
- [📡 API Reference](#-api-reference)
- [⚙️ Environment Configuration](#️-environment-configuration)
- [🛠️ Local Development & Testing](#️-local-development--testing)
- [📁 Codebase Directory Structure](#-codebase-directory-structure)

---

## 🏛️ System Architecture

The backend implements a **5-stage hybrid multi-agent pipeline** optimized for local Small Language Models (SLMs) running on Ollama:

```
[ POST /api/chat ]
        │
        ├── 1. Fast-Path Pre-Classifier (<300ms) ──► Direct LLM Output (No Routing Overhead)
        │
        └── 2. LLM Router (Ollama llama3.2)
              │
              ├── 3. RAG Intent ──► Single-Pass RAG Engine (PostgreSQL 16 Vector + pg_trgm)
              │
              └── 4. Multi-Domain Intent ──► LangGraph Supervisor (@langchain/langgraph-supervisor)
                                                    │
                                                    ├── GitHub Micro-Agent (1 Bounded Tool)
                                                    ├── Jira Micro-Agent (1 Bounded Tool)
                                                    └── Notion Micro-Agent (1 Bounded Tool)
                                                    │
                                                    └── 5. Single-Pass Markdown Response Formatter
```

---

## 🧩 Subsystem Breakdown

### 1. Fast-Path Pre-Classifier (`src/agent/fastPath.js`)
- Intercepts simple conversational, math, or code generation queries in **<300ms**.
- Bypasses tool routing overhead and vector search latency when external tools are not required.

### 2. Multi-Agent Supervisor (`src/agent/graph.js`)
- Built on `@langchain/langgraph-supervisor` to manage worker agent handoffs and prevent routing loops.
- **Single-Tool Bounding Policy**: Restricts specialized sub-agents to **at most 1 tool definition per call**, raising SLM function-calling accuracy above 95%.

### 3. Single-Pass RAG Engine (`src/rag/retriever.js` & `src/rag/ingest.js`)
- Uses PostgreSQL 16 parent-child document chunking with `pg_trgm` full-text search and vector similarity (`pdf_chunks`).
- Synthesizes document summaries, key insights, and citations in a **single LLM pass** to eliminate double-LLM latency and text degradation.

### 4. Admin API Module (`src/routes/admin.js`)
- Provides RESTful management interfaces for system status aggregation, RAG PDF document vector chunk inspection, document deletion, and telemetry metrics.

### 5. Database Separation & Fallbacks (`src/db/postgres.js`)
- **Primary App DB** (`taskflow` on port 5432): Application state, active session threads, PDF chunks, and cached GitHub issues (`github_issues`).
- **Analytics DB** (`langfuse_db` on port 5433): Dedicated strictly to telemetry traces, token counts, and latency metrics.
- **Fault-Tolerant Caching**: In-memory stores (`inMemoryPdfChunks`, `inMemoryGithubIssues`) guarantee backend endpoints respond even if PostgreSQL is temporarily restarting.

---

## 📡 API Reference

### Health Check
- **`GET /api/health`**
  - Returns current health status of Database, LLM Agent, MCP Server, and RAG Engine.

### Admin & System Operations
- **`GET /api/admin/system-status`**
  - Aggregates Ollama status, PostgreSQL pool health, Langfuse DB ping, and process uptime.
- **`GET /api/admin/documents`**
  - Returns list of ingested RAG PDF documents, file sizes, and chunk counts.
- **`GET /api/admin/documents/:filename/chunks`**
  - Retrieves all extracted text vector chunks for a specific document.
- **`DELETE /api/admin/documents/:filename`**
  - Deletes a PDF document and all its corresponding vector chunks from PostgreSQL.
- **`GET /api/admin/telemetry`**
  - Summarizes fast-path vs supervisor routing ratios and user feedback ratings.

### Session Management
- **`GET /api/session`**
  - Initializes or retrieves cookie/header session context and active chat thread IDs.

### Chat Inference
- **`POST /api/chat`**
  - **Body**: `{"message": "string", "mode": "baseline|advanced", "threadId": "string"}`
  - Executes the multi-agent supervisor/router model or single-pass RAG pipeline and returns structured markdown responses.

### PDF Document Ingestion
- **`POST /api/rag/upload`**
  - **Body**: `multipart/form-data` with `pdf` file attachment.
  - Chunks, embeds, and indexes PDF content into PostgreSQL `pdf_chunks`.

### Telemetry & Feedback
- **`POST /api/feedback`**
  - **Body**: `{"score": "thumbs_up|thumbs_down", "threadId": "string", "comment": "string"}`
  - Logs user feedback asynchronously to telemetry stores without blocking HTTP responses.

---

## ⚙️ Environment Configuration

Configuration is managed via [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env) (templated in [`backend/.env.example`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env.example)).

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `RUNTIME_MODE` | `full` | Runtime profile (`rag_only` or `full`) |
| `ROUTER_ROLLOUT_MODE` | `enforced` | Pre-classifier router state (`off`, `shadow`, `enforced`) |
| `DATABASE_URL` | `postgresql://taskflow:taskflow@localhost:5432/taskflow` | Primary PostgreSQL database connection string |
| `ANALYTICS_DB_URL` | `postgresql://langfuse:langfuse@localhost:5433/langfuse_db` | Dedicated telemetry database connection string |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama local API base URL |
| `LLM_DEFAULT_PROVIDER` | `ollama` | Provider backend (`ollama`, `google`, `openai`) |

---

## 🛠️ Local Development & Testing

### Installation & Server Start
```bash
cd backend
npm install
npm run dev
```
The server will start on port `4000` (or `PORT` environment variable).

### Automated Testing (Jasmine Suite)
Run all **104 unit specs**:
```bash
npm test
```

Run a specific spec file:
```bash
npx jasmine test/services/agentService.spec.js
```

---

## 📁 Codebase Directory Structure

```
backend/
├── src/
│   ├── agent/            # LangGraph supervisor, router, fast-path classifier
│   ├── application/      # Service layer orchestration (chat, health, feedback)
│   ├── db/               # PostgreSQL connection pool & resilient fallback stores
│   ├── llm/              # Ollama/LangChain model initializer
│   ├── mcp/              # Model Context Protocol integrations & tool resiliency wrappers
│   ├── rag/              # PDF chunking, embedding, hybrid retriever engine
│   ├── routes/           # Express API endpoints (api.js, admin.js, rag.js, upload.js)
│   └── utils/            # Response formatters, logger, non-blocking tracer
├── test/                 # Jasmine unit test specifications (104 specs)
├── .env.example          # Environment variables template
└── package.json          # Node.js dependencies & ESM scripts
```

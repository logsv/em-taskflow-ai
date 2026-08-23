# ⚙️ EM TaskFlow AI - Backend Service

> **Node.js ESM Microservices Backend powering local-first RAG (HyDE + RRF + Redis Cache), LangGraph Multi-Agent Supervision, MCP Integrations (Jira OAuth 2.0 PKCE, Notion REST, GitHub PAT/OAuth, Slack Web API, Google Calendar), Administrative APIs, Per-Service Database Isolation, and Ollama LLM Inference.**

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

The backend implements an **8-stage hybrid multi-agent pipeline** optimized for local Small Language Models (SLMs) running on Ollama:

```
[ POST /api/chat ]
        │
        ├── 1. Redis Semantic Cache Check (Cosine Sim >= 0.95) ──► Cache Hit (<50ms Instant Response)
        │
        ├── 2. Fast-Path Pre-Classifier (<300ms) ──► Direct LLM Output (No Routing Overhead for Math/Code/Chat)
        │
        └── 3. LLM Router (Ollama hermes3:8b) + Resilient JSON Parser
              │
              ├── 4. RAG Intent ──► Single-Pass HyDE + RRF Engine (taskflow_ai DB)
              │
              └── 5. Multi-Domain Intent ──► LangGraph Supervisor (@langchain/langgraph-supervisor)
                                                    │
                                                    ├── 10 Specialized Micro-Agents (1 Bounded Tool Each)
                                                    │   (DORA, Delivery, SBI, People, Sprint, Retro, Roadmap, OKR, SOP, Critic)
                                                    │
                                                    └── 6. Multi-Source MCP Integrations (Jira, Notion, GitHub, Slack, Calendar)
                                                    │
                                                    └── 7. Single-Pass Markdown Response Formatter
```

---

## 🧩 Subsystem Breakdown

### 1. Redis Semantic Cache (`src/cache/semanticCache.js`)
- Uses Redis vector similarity search (`redis:7-alpine`) to intercept incoming queries.
- Returns pre-computed answers in **<50ms** when query cosine similarity is >= **0.95**, with a 1-hour TTL and SHA-256 query keying.

### 2. Fast-Path Pre-Classifier (`src/agent/llmRouter.js` / `classifyFastPath`)
- Intercepts simple conversational, math, code generation, and direct file attachment queries in **<300ms**.
- Bypasses tool routing overhead and vector search latency when external tools are not required.

### 3. Multi-Agent Supervisor (`src/agent/graph.js` & `src/agent/`)
- Built on `@langchain/langgraph-supervisor` to manage worker agent handoffs across 10 domain micro-agents:
  - `dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`.
- **Single-Tool Bounding Policy**: Restricts specialized sub-agents to **at most 1 tool definition per call**, raising SLM function-calling accuracy above 95%.

### 4. Multi-Source Model Context Protocol (MCP) Ecosystem (`src/mcp/`)
- **Jira OAuth 2.0 PKCE** (`jiraOAuth.js`, `jira.js`): JQL queries, issue details, and automated token refresh.
- **Notion REST API** (`notion.js`, `notionOAuth.js`): Workspace searches and database querying.
- **GitHub REST API** (`github.js`, `githubOAuth.js`): Scoped PAT/OAuth authentication, PRs, issues, DORA events.
- **Slack Web API** (`slack.js`): Channel listings, message search, and message dispatch.
- **Google Calendar** (`google.js`): Dynamic calendar ID event listing and meeting schedules.
- **Base Tool Harness** (`baseToolHarness.js`): Circuit breaker, retry backoff, and execution metrics.

### 5. Single-Pass RAG Engine (`src/rag/retriever.js` & `src/rag/ingest.js`)
- Performs **HyDE (Hypothetical Document Embeddings)** query expansion.
- Calls Python AI service (`python-ai-service:50051`/`8000`) for Dense HNSW vector search + Sparse `pg_trgm` BM25 search merged via SQL CTE Reciprocal Rank Fusion (RRF).
- Synthesizes document summaries, key insights, and citations in a **single LLM pass** to eliminate double-LLM latency.

### 6. Admin API Module (`src/routes/admin.js`)
- Provides RESTful management interfaces for system status aggregation, RAG PDF document vector chunk inspection, document deletion, and telemetry metrics.

### 7. Database Per-Service Isolation (`src/db/postgres.js`)
- **Backend API DB** (`taskflow_backend` on port 5432): Application state, active session threads, messages, GitHub issues (`github_issues`), OKRs, DORA metrics, team members, app settings.
- **Python AI DB** (`taskflow_ai` on port 5432): RAG document chunks (`pdf_chunks`) and vector embeddings.
- **Analytics DB** (`langfuse_db` on port 5433): Dedicated strictly to telemetry traces, token counts, and latency metrics.

---

## 📡 API Reference

### Health Check
- **`GET /api/health`**
  - Returns current health status of Database, LLM Agent, MCP Server, and RAG Engine.

### Session & Thread Management
- **`GET /api/session`**: Resolves active cookie/header session context and current chat thread.
- **`GET /api/sessions?page=1&limit=10`**: Returns paginated session inventory with active thread titles and activity timestamps.
- **`POST /api/sessions`**: Creates a new session with an initial chat thread.
- **`GET /api/sessions/:sessionId/threads`**: Lists paginated threads for a session.
- **`POST /api/threads`**: Creates a new chat thread for the active session.
- **`POST /api/sessions/:sessionId/switch`**: Switches the active thread for the specified session.
- **`GET /api/threads/:threadId/messages`**: Retrieves message history for a thread.

### Chat Inference
- **`POST /api/chat`**
  - **Body**: `{"message": "string", "mode": "baseline|advanced", "threadId": "string", "attachments": [...]}`
  - Executes the multi-agent supervisor/router model or single-pass RAG pipeline and returns structured markdown responses.

### Jira OAuth 2.0 PKCE Endpoints
- **`GET /api/oauth/jira/authorize`**: Initiates Jira OAuth authorization redirect.
- **`GET /api/oauth/jira/callback`**: Handles OAuth authorization code exchange.
- **`GET /api/oauth/jira/status`**: Returns current Jira OAuth connection status.
- **`POST /api/oauth/jira/disconnect`**: Disconnects active Jira OAuth credentials.

### Engineering Manager Productivity Endpoints
- **`GET /api/em/dora`**: Returns DORA metrics with tier ratings (*Elite*, *High*, *Medium*, *Low*).
- **`GET /api/em/sprints`**: Returns sprint health, story point velocity, and WIP metrics.
- **`GET /api/em/okrs`**: Returns quarterly OKR progress and pacing scores.
- **`GET /api/em/sbi`**: Returns structured Situation-Behavior-Impact feedback logs.

### Admin & System Operations
- **`GET /api/admin/system-status`**: Aggregates Ollama status, PostgreSQL pool health, Langfuse DB ping, and process uptime.
- **`GET /api/admin/documents`**: Returns list of ingested documents, file sizes, and chunk counts.
- **`GET /api/admin/documents/:filename/chunks`**: Retrieves extracted text chunks for chunk modal viewer.
- **`DELETE /api/admin/documents/:filename`**: Deletes document chunks from PostgreSQL.

### PDF Document Ingestion
- **`POST /api/rag/upload`**
  - **Body**: `multipart/form-data` with document file attachment (PDF, CSV, TXT, PNG/JPG).
  - Processes document ingestion durably via Temporal workflows (`rag-ingest-queue`).

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
| `DATABASE_URL` | `postgresql://taskflow:taskflow@localhost:5432/taskflow_backend` | Backend PostgreSQL database connection string |
| `ANALYTICS_DB_URL` | `postgresql://langfuse:langfuse@localhost:5433/langfuse_db` | Dedicated telemetry database connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis semantic cache URL |
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
Run all **235 unit specs**:
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
│   ├── agent/            # LangGraph supervisor, 10 domain micro-agents, router, prompts
│   ├── application/      # Service layer orchestration (chat, session, health, feedback)
│   ├── cache/            # Redis semantic caching (semanticCache.js)
│   ├── db/               # PostgreSQL connection pool & resilient fallback stores
│   ├── docs/             # OpenAPI 3.1 schema specification (openapi.json)
│   ├── grpc/             # gRPC client for Python AI service
│   ├── llm/              # Ollama/LangChain model initializer
│   ├── mcp/              # MCP integrations (Jira, Notion, GitHub, Slack, Calendar, Base Harness)
│   ├── rag/              # Document chunking, HyDE transformation, hybrid retriever engine
│   ├── routes/           # Express API endpoints (api.js, admin.js, docs.js, rag.js, upload.js)
│   └── utils/            # Response formatters, logger, non-blocking tracer
├── test/                 # Jasmine unit test specifications (235 specs)
├── .env.example          # Environment variables template
└── package.json          # Node.js dependencies & ESM scripts
```

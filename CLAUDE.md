# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**EM TaskFlow AI** is a full-stack, local-first enterprise productivity platform powered by **100% Local LLM Inference (Ollama)**, Hybrid RAG (HyDE + RRF + HNSW), Model Context Protocol (MCP) integrations (Jira OAuth 2.0 PKCE, Notion REST API, GitHub PAT/OAuth, Slack Web API, Google Calendar), a LangGraph Multi-Agent Supervisor, and isolated PostgreSQL databases.

## Architecture

This is a polyglot microservices system:

- **Backend**: Node.js 20+ with ES Modules (`"type": "module"`), Express, `@langchain/langgraph-supervisor`, and pg driver.
- **Frontend**: React 18 SPA built with Vite, `@assistant-ui/react`, space-dark glassmorphism design system, and Standalone Admin Portal (`/admin`).
- **Python AI Service**: Python 3.12 microservice (REST on port 8000 & gRPC on port 50051) for parent-child chunking, Cross-Encoder reranking, and `taskflow_ai` vector operations.
- **Vector & Relational Storage**: PostgreSQL 16 (`pgvector/pgvector:pg16`) with per-service database isolation (`taskflow_backend`, `taskflow_ai`, `temporal`).
- **Semantic Caching**: Redis 7 Alpine (`em-taskflow-redis:6379`) with vector similarity caching (0.95 cosine threshold, 1h TTL).
- **Telemetry & Tracing**: Self-hosted Langfuse (port 3001) backed by isolated `langfuse_db` on port 5433 (`analytics-db`).
- **Durable Orchestration**: Temporal Workflows on port 7233 (UI on port 8233).

### Key Services & Modules

- **Agent Service (`backend/src/services/agentService.js`)**: Coordinates Fast-Path classifier, LLM router, and LangGraph multi-agent supervisor.
- **10 Domain Micro-Agents (`backend/src/agent/`)**:
  - `dora`: DORA metrics from GitHub, Jira, and PostgreSQL snapshots.
  - `delivery`: Delivery bottlenecks, review cycle turnaround, and Jira blockers.
  - `sbi`: Situation-Behavior-Impact coaching using Jira, 1-on-1 notes, and Slack.
  - `people`: Career progression, 1-on-1s, Google Calendar frequency, Notion career ladders.
  - `sprint`: Sprint capacity, story point velocity, Jira backlog, and calendar PTOs.
  - `retro`: Retrospective generation with thematic clustering (Notion, Jira, GitHub, Slack).
  - `roadmap`: Milestone alignment and drift detection across Jira, GitHub, Notion.
  - `okr`: Quarterly OKR pacing scores and KPI progress evaluation.
  - `sop`: SOP compliance, ADR governance, architecture decision records, review SLAs.
  - `critic`: Audit and critique draft EM status reports, dossiers, and performance summaries.
- **MCP Ecosystem (`backend/src/mcp/`)**:
  - `jiraOAuth.js` & `jira.js`: Jira OAuth 2.0 PKCE flow, JQL search, and issue retrieval.
  - `notion.js` & `notionOAuth.js`: Native Notion REST API and database query tools.
  - `github.js` & `githubOAuth.js`: Repo-scoped PAT/OAuth, PR search, and DORA events.
  - `slack.js`: Slack Web API channel search and messaging.
  - `google.js`: Google Calendar REST API event listing and schedule inspection.
  - `baseToolHarness.js`: Standardized circuit breaker, backoff, and execution logging.
- **RAG Retriever (`backend/src/rag/retriever.js`)**: Single-pass answer synthesis with HyDE query transformation and Reciprocal Rank Fusion (RRF CTE).
- **Database Layer (`backend/src/db/postgres.js`)**: Multi-session persistence, chat threads, messages, and MCP fallback caches.

## Development & Test Commands

### Backend (from `/backend`)
```bash
# Start development server with auto-reload
npm run dev

# Build ESM JavaScript output
npm run build

# Run unit tests with Jasmine (240 specs, 0 failures)
npm test

# Run full evaluation suite (Model: hermes3:8b)
npm run evaluate
npm run eval:multi-agent
npm run eval:rag
npm run eval:pre-llm
```

### Python AI Service (from `/services/python-ai-service`)
```bash
# Run Pytest suite (39 specs, 0 failures)
uv run pytest
```

### Frontend (from `/frontend`)
```bash
# Start Vite dev server (port 3000)
npm run dev

# Build production bundle
npm run build
```

### Full Container Management (from project root)
```bash
# Start all containers in background
docker compose up -d --build

# Check container status
docker compose ps

# View container logs
docker compose logs -f backend python-ai-service postgres redis langfuse
```

## Service Topology & Ports

1. **Frontend Cockpit**: `http://localhost:3000` (Admin Portal at `http://localhost:3000/admin`)
2. **Backend Express API**: `http://localhost:4000` (`/api/health`, `/api/chat`, `/api/sessions`, `/api/admin/*`, `/api/docs`)
3. **Python AI Microservice**: Port 8000 (REST) and Port 50051 (gRPC)
4. **PostgreSQL 16**: Port 5432 (`taskflow_backend`, `taskflow_ai`, `temporal`)
5. **Analytics DB (Langfuse)**: Port 5433 (`langfuse_db`)
6. **Langfuse UI**: `http://localhost:3001`
7. **Promptfoo Matrix Server**: `http://localhost:15500`
8. **Adminer Database Explorer**: `http://localhost:8080`
9. **Temporal Web UI**: `http://localhost:8233`
10. **Ollama Local LLM**: `http://localhost:11434` (`hermes3:8b`, `nomic-embed-text`)

## Architectural Guidelines & Rules

- **Zero Cloud LLM Requirement**: All inferences run locally against Ollama (`hermes3:8b`). External cloud LLMs are disabled.
- **1-Tool Sub-Agent Bounding**: Sub-agents in LangGraph are bounded to maximum 1 tool per call for local SLM accuracy >95%.
- **Zero Misleading Fallbacks**: Fallback responses return real PostgreSQL cached snapshots (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`). Never output hardcoded dummy strings.
- **Non-Blocking Telemetry**: Tracing calls to Langfuse must be non-blocking and never crash request lifecycles.
- **Test Integrity**: Never push without running backend unit tests (`240 specs`) and Python unit tests (`39 specs`).
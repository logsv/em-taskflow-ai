# AGENTS.md

This file provides system guidance, architectural rules, and development guidelines for Codex, Gemini CLI, Antigravity, and AI agents working in this repository.

---

## 🏗️ Project Overview

**EM TaskFlow AI** is a full-stack, local-first enterprise productivity platform powered by **100% Local LLM Inference (Ollama)**, Retrieval-Augmented Generation (RAG), Model Context Protocol (MCP) integrations, and a LangGraph Multi-Agent Supervisor.

---

## 🏛️ Architecture Blueprint

### 1. Local LLM Infrastructure (100% Ollama)
- **Primary LLM Provider**: **Ollama** running locally on `http://localhost:11434` (or `http://host.docker.internal:11434` in Docker).
- **Default Models**: `llama3.2:latest` (or `mistral:latest`) for chat/reasoning and `nomic-embed-text` / `qwen3-vl` for embeddings.
- **Zero Cloud Key Requirement**: External cloud APIs (Gemini, OpenAI, Anthropic) are disabled (`LLM_GOOGLE_ENABLED: false`, `LLM_OPENAI_ENABLED: false`).

### 2. Database & Vector Storage (PostgreSQL 16)
- **Single Source of Truth**: PostgreSQL 16 (user: `taskflow`, db: `taskflow`, password: `taskflow`).
- **Hybrid Vector + Full-Text Search**:
  - `pdf_chunks`: Parent-child document chunking with `pg_trgm` full-text search and vector similarity.
  - `github_issues`: Cached GitHub issues with JSONB fields.
  - `sessions`, `chat_threads`, `chat_messages`, `feedback`: Session state and message history.
- **Fault-Tolerant In-Memory Fallbacks**: In-memory stores (`inMemoryPdfChunks`, `inMemoryGithubIssues`) ensure backend endpoints NEVER fail even if PostgreSQL is temporarily offline.

### 3. Multi-Agent System (LangGraph Supervisor + Micro-Agents)
- **Fast-Path Classifier**: `<300ms` pre-router classifier (`classifyFastPath`) for direct LLM queries (greetings, code generation, math), bypassing routing overhead.
- **LangGraph Supervisor**: `@langchain/langgraph-supervisor` top-level orchestrator.
- **Micro-Agent Tool Limit Rule**: Local 3B/7B SLMs degrade in accuracy when presented with >5 tools. Each ReAct sub-agent (e.g., `github_issue_agent`) is restricted to **max 1 tool definition** at a time (raising execution accuracy to 95%+).

### 4. Single-Pass RAG Engine & Response Formatter
- **Single-Pass Generation**: `generateAnswer()` in `backend/src/rag/retriever.js` generates structured markdown sections directly in ONE pass:
  - `### 📄 Executive Summary`
  - `### 🔍 Key Document Analysis & Rubric Guidelines`
  - `### 📌 Source Citations`
- **Formatter Bypass**: RAG hit queries (`decision.ragHit = true`) bypass secondary EM JSON re-formatting in `responseFormatter.js` to eliminate double-LLM latency and text degradation.

### 5. Frontend UI & Cache Control
- **Framework**: React 19 + Vite + `@assistant-ui/react`.
- **Unified PDF Center**: Single collapsible `📄 PDF Documents (RAG)` section in `Sidebar.jsx` with inline file picker (`+ PDF`) and live document history (`GET /api/rag/documents`).
- **NGINX Cache Control**: `Cache-Control: no-store, no-cache, must-revalidate` for `index.html` prevents stale browser disk caching.

---

## 🛠️ Development & Operational Commands

### Backend Commands (from `/backend`)
```bash
# Start development server with auto-reload
npm run dev

# Build ESM JavaScript output
npm run build

# Run unit tests with Jasmine & coverage (88 specs)
npm test
```

### Full Container Management (from project root)
```bash
# Build and launch all containers in background (Postgres, Backend, Frontend)
docker compose up -d --build

# Force rebuild frontend container without cache
docker compose build --no-cache frontend && docker compose up -d frontend

# Check container health status
docker compose ps
```

---

## 🧪 Testing & Verification Rules

- **Coverage Engine**: NYC (Istanbul) with Jasmine test runner (`backend/test/`).
- **Rule of Verification**: Never declare success without executing `npm test`. All 88 specs must pass with **0 failures**.
- **Observability**: Set `LANGSMITH_API_KEY` (or `LANGCHAIN_API_KEY`) to automatically log V2 agent execution traces to project `em-taskflow-ai`.
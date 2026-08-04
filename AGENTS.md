# AGENTS.md

This file provides system guidance, architectural rules, anti-hallucination guidelines, and development rules for Codex, Gemini CLI, Antigravity, and AI agents working in this repository.

---

## 🏗️ Project Overview

**EM TaskFlow AI** is a full-stack, local-first enterprise productivity platform powered by **100% Local LLM Inference (Ollama)**, Retrieval-Augmented Generation (RAG), Model Context Protocol (MCP) integrations, and a LangGraph Multi-Agent Supervisor.

---

## 🛡️ Anti-Hallucination & Coding Rules (STRICT ENFORCEMENT)

1. **Rule of Empirical Log Inspection**:
   - NEVER form a diagnostic hypothesis for a runtime failure or test breakage without reading the full, un-truncated error log.
   - Base all debugging strictly on log evidence, stack traces, and actual empirical outputs.

2. **Rule of Zero-Downtime Telemetry**:
   - Telemetry, tracing (Langfuse/LangSmith), and observability callbacks MUST be non-blocking.
   - An error in telemetry or trace logging must NEVER fail an API request or crash a server endpoint.

3. **Rule of Database Separation**:
   - **Primary App DB** (`taskflow` on port 5432): Application state, sessions, issue caches, PDF chunks.
   - **Analytics DB** (`langfuse_db` on port 5433): Dedicated strictly to trace graphs, token counts, and latency telemetry.
   - Agents must NEVER write analytics trace tables into the primary application schema.

4. **Rule of Verification**:
   - Never declare success without executing `npm test`. All 88 specs must pass with **0 failures**.

5. **No Superficial Symptom Patches**:
   - NEVER resolve errors by masking symptoms, swallowing exceptions silently, returning dummy fallbacks, or commenting out failing unit test assertions.

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
# Build and launch all containers in background
docker compose up -d --build

# Force rebuild frontend container without cache
docker compose build --no-cache frontend && docker compose up -d frontend

# Check container health status
docker compose ps
```
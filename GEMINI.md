# GEMINI.md - Agent & SLM Architecture Guidelines

This document outlines the architecture, routing rules, and multi-agent policies of the EM TaskFlow AI platform.

---

## 🤖 Agent Architecture

The backend agent uses a **6-stage hybrid architecture** optimized for **Local SLMs (Ollama)** to process queries with high accuracy, zero double-LLM latency, and minimal prompt context bloat.

```
[ User Query + Uploads + History ]
      │
      ├── Pre-LLM Preprocessing & Compression Stage
      │     ├── File Attachments ──► LangChain Map-Reduce Summarization (>15k chars)
      │     ├── RAG Candidates   ──► Cross-Encoder Reranker + MMR Deduplication
      │     └── Chat History     ──► Recency Sliding Window + State Anchoring (>10 turns)
      │
      ├── Fast-Path Classifier (<300ms) ──► Direct LLM Output (0 tools)
      │
      └── LLM Router (Ollama llama3.2)
            │
            ├── RAG Intent ──► Single-Pass Ollama Document Synthesis
            │
            └── Multi-Domain Intent ──► LangGraph Supervisor
                                              │
                                              ├── GitHub Micro-Agent (1 tool)
                                              ├── Jira Micro-Agent (1 tool)
                                              └── Notion Micro-Agent (1 tool)
```

---

## 🧭 Multi-Stage Workflow

### 1. Pre-LLM Preprocessing & Compression (`activities.py`, `rest_router.py`, `ChatApplicationService.js`)
- Executed BEFORE passing prompts to the primary Ollama SLM / LangGraph Supervisor:
  - **File Attachment Compression**: Summarizes file uploads >15,000 chars using LangChain Map-Reduce into structured executive summaries.
  - **RAG MMR Deduplication**: Reranks and prunes near-duplicate text chunks via Cross-Encoder + MMR.
  - **Chat History Windowing**: Retains active 8 turns verbatim and state-anchors earlier turns into a 2-line summary block.

### 2. Fast-Path Pre-Classifier (`classifyFastPath`)
- Zero-latency pre-classifier that intercepts pure conversational, math, or code-generation queries.
- Executes in **<300ms**, bypassing tool routing and RAG search overhead.

### 3. LLM Router (`llmRouter.js`)
- Analyzes domain requirements (`github`, `rag`, `jira`, `notion`, `calendar`).
- Outputs JSON specifying `domains`, `must_use_tools`, `allow_rag`, and `confidence`.

### 4. LangGraph Supervisor (`graph.js`)
- Uses `@langchain/langgraph-supervisor` to manage worker agent handoffs.
- Enforces policy guardrails:
  - **Single Tool Rule**: Limits specialized sub-agents to **1 tool per call** to maximize SLM function-calling accuracy.
  - **Loop Prevention**: Intercepts repeated worker transitions.

### 5. Single-Pass RAG Engine (`retriever.js`)
- Performs hybrid vector + `pg_trgm` full-text search on PostgreSQL `pdf_chunks`.
- Generates structured markdown sections in a **single LLM pass** (`Executive Summary`, `Key Insights`, `Citations`), bypassing double-LLM formatting overhead.

### 6. Resilient Database Fallbacks (`postgres.js`)
- If live MCP tool servers time out, automatic fallback retrieves cached data from PostgreSQL (`github_issues`, `inMemoryPdfChunks`), presenting stale-data warnings to the user.

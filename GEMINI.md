# GEMINI.md - Agent & SLM Architecture Guidelines

This document outlines the architecture, routing rules, and multi-agent policies of the EM TaskFlow AI platform.

---

## 🤖 Agent Architecture

The backend agent uses a **5-stage hybrid architecture** optimized for **Local SLMs (Ollama)** to process queries with high accuracy and low latency.

```
[ User Query ]
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

### 1. Fast-Path Pre-Classifier (`classifyFastPath`)
- Zero-latency pre-classifier that intercepts pure conversational, math, or code-generation queries.
- Executes in **<300ms**, bypassing tool routing and RAG search overhead.

### 2. LLM Router (`llmRouter.js`)
- Analyzes domain requirements (`github`, `rag`, `jira`, `notion`, `calendar`).
- Outputs JSON specifying `domains`, `must_use_tools`, `allow_rag`, and `confidence`.

### 3. LangGraph Supervisor (`graph.js`)
- Uses `@langchain/langgraph-supervisor` to manage worker agent handoffs.
- Enforces policy guardrails:
  - **Single Tool Rule**: Limits specialized sub-agents to **1 tool per call** to maximize SLM function-calling accuracy.
  - **Loop Prevention**: Intercepts repeated worker transitions.

### 4. Single-Pass RAG Engine (`retriever.js`)
- Performs hybrid vector + `pg_trgm` full-text search on PostgreSQL `pdf_chunks`.
- Generates structured markdown sections in a **single LLM pass** (`Executive Summary`, `Key Insights`, `Citations`), bypassing double-LLM formatting overhead.

### 5. Resilient Database Fallbacks (`postgres.js`)
- If live MCP tool servers time out, automatic fallback retrieves cached data from PostgreSQL (`github_issues`, `inMemoryPdfChunks`), presenting stale-data warnings to the user.

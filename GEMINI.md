# GEMINI.md - Agent & SLM Architecture Guidelines

This document outlines the architecture, routing rules, multi-agent policies, and database separation of the EM TaskFlow AI platform.

---

## 🤖 Agent Architecture

The backend agent uses a **6-stage hybrid architecture** optimized for **Local SLMs (Ollama)** to process queries with high accuracy, zero double-LLM latency, and minimal prompt context bloat.

```
[ User Query + Uploads + History ]
      │
      ├── 1. Pre-LLM Preprocessing & Compression Stage
      │     ├── File Attachments ──► LangChain Map-Reduce Summarization (>15k chars)
      │     ├── RAG Candidates   ──► HyDE + Cross-Encoder Reranker + MMR Deduplication
      │     └── Chat History     ──► Recency Sliding Window + State Anchoring (>10 turns)
      │
      ├── 2. Redis Semantic Cache Check ──► Cache Hit (Cosine Sim >= 0.95) ──► Direct Cached Response
      │
      ├── 3. Fast-Path Classifier (<300ms) ──► Direct LLM Output (0 tools)
      │
      └── 4. LLM Router (Ollama hermes3:8b)
            │
            ├── RAG Intent ──► Single-Pass HyDE + RRF Hybrid Document Synthesis (taskflow_ai DB)
            │
            └── Multi-Domain Intent ──► LangGraph Supervisor
                                              │
                                              ├── DORA Micro-Agent (calculate_dora_metrics)
                                              ├── Delivery Micro-Agent (analyze_delivery_bottlenecks)
                                              ├── SBI Micro-Agent (format_sbi_feedback)
                                              ├── People Micro-Agent (analyze_personnel_growth)
                                              ├── Sprint Micro-Agent (calculate_sprint_plan)
                                              ├── Retro Micro-Agent (generate_sprint_retro)
                                              ├── Roadmap Micro-Agent (get_roadmap_alignment)
                                              ├── OKR Micro-Agent (evaluate_okr_progress)
                                              ├── SOP Micro-Agent (query_sop_compliance)
                                              └── Critic Micro-Agent (audit_em_report)
```

---

## 🧭 Multi-Stage Workflow

### 1. Pre-LLM Preprocessing & Compression (`activities.py`, `rest_router.py`, `ChatApplicationService.js`)
- Executed BEFORE passing prompts to the primary Ollama SLM / LangGraph Supervisor:
  - **File Attachment Compression**: Summarizes file uploads >15,000 chars using LangChain Map-Reduce into structured executive summaries.
  - **RAG MMR Deduplication**: Reranks and prunes near-duplicate text chunks via Cross-Encoder + MMR.
  - **Chat History Windowing**: Retains active 8 turns verbatim and state-anchors earlier turns into a 2-line summary block.

### 2. Redis Semantic Cache (`semanticCache.js`)
- High-speed vector similarity caching module powered by Redis (`redis:7-alpine`).
- Intercepts incoming queries; if cosine similarity >= **0.95**, returns pre-computed responses instantly with a **1-hour TTL**, bypassing LLM generation.

### 3. Fast-Path Pre-Classifier (`classifyFastPath`)
- Zero-latency pre-classifier that intercepts pure conversational, math, or code-generation queries.
- Executes in **<300ms**, bypassing tool routing and RAG search overhead.

### 4. LLM Router (`llmRouter.js`)
- Analyzes domain requirements across `VALID_DOMAINS` (`dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`, `jira`, `github`, `notion`, `calendar`, `rag`).
- Outputs JSON specifying `domains`, `must_use_tools`, `allow_rag`, and `confidence`.

### 5. LangGraph Supervisor (`graph.js`)
- Uses `@langchain/langgraph-supervisor` to manage worker agent handoffs across 10 domain micro-agents.
- Enforces policy guardrails:
  - **Single Tool Rule**: Limits specialized sub-agents to **1 tool per call** to maximize SLM function-calling accuracy.
  - **Loop Prevention**: Intercepts repeated worker transitions.

### 6. Single-Pass RAG Engine & Per-Service DB (`retriever.js` & `database.py`)
- Performs **HyDE (Hypothetical Document Embeddings)** query transformation.
- Executes CTE-based **Reciprocal Rank Fusion (RRF)** merging dense `pgvector` HNSW search with sparse `pg_trgm` full-text search against the isolated `taskflow_ai` database.
- Generates structured markdown sections in a **single LLM pass** (`Executive Summary`, `Key Insights`, `Citations`), bypassing double-LLM formatting overhead.

### 7. Resilient Per-Service Database Isolation (`postgres.js`)
- **`taskflow_backend`**: Houses application sessions, chat threads, and cached GitHub issues (`github_issues`).
- **`taskflow_ai`**: Houses vector document chunks (`pdf_chunks`).
- **`temporal` & `temporal_visibility`**: Houses workflow state.
- **`langfuse_db`**: Houses telemetry traces on port 5433.
- If live MCP tool servers time out, automatic fallback retrieves cached data from PostgreSQL, presenting stale-data warnings to the user.

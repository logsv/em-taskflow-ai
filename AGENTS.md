# AGENTS.md

This file provides system guidance, architectural rules, anti-hallucination guidelines, and development rules for Codex, Gemini CLI, Antigravity, and AI agents working in this repository.

---

## 🏗️ Project Overview

**EM TaskFlow AI** is a full-stack, local-first enterprise productivity platform powered by **100% Local LLM Inference (Ollama)**, Retrieval-Augmented Generation (RAG), Model Context Protocol (MCP) integrations (Jira OAuth 2.0 PKCE, Notion REST, GitHub PAT/OAuth, Slack Web API, Google Calendar), a LangGraph Multi-Agent Supervisor, and isolated per-service PostgreSQL databases.

---

## 🛡️ Anti-Hallucination & Coding Rules (STRICT ENFORCEMENT)

1. **Rule of Empirical Log Inspection**:
   - NEVER form a diagnostic hypothesis for a runtime failure or test breakage without reading the full, un-truncated error log.
   - Base all debugging strictly on log evidence, stack traces, and actual empirical outputs.

2. **Rule of Zero-Downtime Telemetry**:
   - Telemetry, tracing (Langfuse), and observability callbacks MUST be non-blocking.
   - An error in telemetry or trace logging must NEVER fail an API request or crash a server endpoint.

3. **Rule of Database Per-Service Isolation**:
   - **Backend API DB** (`taskflow_backend` on port 5432): Application state, sessions, chat threads, messages, issue caches, OKRs, sprint analytics, DORA metrics, team profiles, app settings.
   - **Python AI DB** (`taskflow_ai` on port 5432): Dedicated strictly to RAG document embeddings (`pdf_chunks`), HNSW vector indexes, and `pg_trgm` full-text search indexes.
   - **Temporal Workflows DB** (`temporal` & `temporal_visibility` on port 5432): Dedicated strictly to Temporal activity execution and task queue state.
   - **Analytics DB** (`langfuse_db` on port 5433): Dedicated strictly to trace graphs, token counts, and latency telemetry on an isolated container (`analytics-db`).
   - Agents must NEVER write analytics trace tables into application databases.

4. **Rule of Verification**:
   - Never declare success without executing unit tests. All **240 backend specs** and **39 Python AI specs** must pass with **0 failures**.

5. **No Superficial Symptom Patches**:
   - NEVER resolve errors by masking symptoms, swallowing exceptions silently, returning dummy fallbacks, or commenting out failing unit test assertions.

---

## 🏛️ Architecture Blueprint

### 1. Local LLM Infrastructure (100% Ollama)
- **Primary LLM Provider**: **Ollama** running locally on `http://localhost:11434` (or `http://host.docker.internal:11434` in Docker).
- **Default Models**: `hermes3:8b` (or `mistral:latest`) for chat/reasoning/evaluations and `nomic-embed-text` / `qwen3-vl` for embeddings.
- **Zero Cloud Key Requirement**: External cloud APIs (Gemini, OpenAI, Anthropic) are disabled (`LLM_GOOGLE_ENABLED: false`, `LLM_OPENAI_ENABLED: false`).

### 2. Isolated Database & Vector Storage (PostgreSQL 16 `pgvector/pgvector:pg16` + Redis)
- **PostgreSQL 16 (`em-taskflow-postgres`)**:
  - `taskflow_backend`: Application state, sessions, threads, chat messages, GitHub issues cache, team members.
  - `taskflow_ai`: Dedicated `pdf_chunks` table with `pgvector` HNSW index (`idx_pdf_chunks_embedding`) and `pg_trgm` FTS index (`idx_pdf_chunks_fts`).
- **Redis (`em-taskflow-redis:6379`)**:
  - `semanticCache.js`: High-speed vector similarity semantic caching for RAG queries (0.95 threshold, 1-hour TTL, SHA-256 keying).
- **Fault-Tolerant In-Memory Fallbacks**: In-memory stores (`inMemoryPdfChunks`, `inMemoryGithubIssues`) ensure backend endpoints NEVER fail even if PostgreSQL is temporarily offline.

### 3. Advanced RAG Engine (HyDE + Dense/Sparse Hybrid Search + RRF)
- **HyDE Query Expansion**: Generates hypothetical candidate document answers (`generateHypotheticalDocument` in `retriever.js`) to enrich retrieval context.
- **Hybrid Dense + Sparse Search**: Dense cosine similarity (`<=>`) combined with `pg_trgm` BM25 full-text search.
- **Reciprocal Rank Fusion (RRF)**: Merges dense and sparse ranks via SQL CTE (`1 / (60 + rank)`) in `database.py`.
- **Multi-Format Ingestion**: Supports PDF, Plain Text, CSV/Sheets, Images (OCR / `qwen3-vl`) processed durably via Temporal workflows (`rag-ingest-queue`).

### 4. Multi-Agent System (LangGraph Supervisor + 10 Domain Micro-Agents)
- **Fast-Path Classifier**: `<300ms` pre-router classifier (`classifyFastPath`) for direct LLM queries (greetings, code generation, math, attachments), bypassing routing overhead.
- **LangGraph Supervisor**: `@langchain/langgraph-supervisor` top-level orchestrator managing handoffs between 10 domain micro-agents:
  1. `dora` (`calculate_dora_metrics`): DORA metrics from GitHub release/PR data, Jira incidents, and PostgreSQL snapshots.
  2. `delivery` (`analyze_delivery_bottlenecks`): Jira blocker tickets, GitHub PR turnaround bottlenecks, delivery metrics.
  3. `sbi` (`format_sbi_feedback`): Situation-Behavior-Impact coaching using Jira ticket context, 1-on-1s, and Slack interactions.
  4. `people` (`analyze_personnel_growth`): Career growth, 1-on-1 tracking, Google Calendar frequency, Notion career ladders.
  5. `sprint` (`calculate_sprint_plan`): Sprint capacity, story point velocity, Jira backlog, Google Calendar PTO schedules.
  6. `retro` (`generate_sprint_retro`): Thematic clustering (*What Went Well*, *Areas for Improvement*, *Action Items*) over Notion retro boards, Jira issues, GitHub DORA events, and Slack discussions.
  7. `roadmap` (`get_roadmap_alignment`): Milestone alignment and drift detection across Jira Epics, GitHub milestones, Notion roadmaps.
  8. `okr` (`evaluate_okr_progress`): Quarterly OKR progress and pacing scores via Notion OKRs, Jira deliverables, GitHub commits.
  9. `sop` (`query_sop_compliance`): SOP compliance, ADR governance, architecture decision records, review SLAs via Notion and PostgreSQL policies.
  10. `critic` (`audit_em_report`): Auditing and critiquing draft EM reports, performance dossiers, and promotion nomination packets.
- **`VALID_DOMAINS` Set**: Aligned across `agentService.js`, pre-classifier router, fallback router, policy validator, and evidence builder to prevent false `unexpected_domains` policy violations.
- **Micro-Agent Tool Limit Rule**: Local 3B/7B SLMs degrade in accuracy when presented with >5 tools. Each ReAct sub-agent is restricted to **max 1 tool definition** at a time (raising execution accuracy to 95%+).
- **Rule of Zero Misleading Fallbacks**: System must NEVER output hardcoded generic placeholder strings (such as fake `@logsv` or fake GitHub issues on non-GitHub queries). Fallbacks must accurately present real PostgreSQL DB snapshots or domain-neutral status indicators.

### 5. Multi-Source MCP Integrations Ecosystem
- **Jira OAuth 2.0 PKCE**: Native Jira REST tool harness (`jira_search`, `jira_get_issue`, `jira_create_issue`) with automated token management.
- **Notion REST API & OAuth 2.0**: Native workspace search (`notion_search`), page fetch (`notion_get_page`), database queries (`notion_query_database`).
- **GitHub REST API**: User-Agent headers, repo scoping, pull requests, issue search, and DORA deployment event tracking.
- **Slack Web API**: Channels listing (`slack_list_channels`), message search (`slack_search_messages`), posting (`slack_post_message`).
- **Google Calendar**: Dynamic calendar ID configuration, event retrieval (`get_calendar_events`), event creation, attendee schedule inspection.
- **Base Tool Harness**: Standardized circuit breaking, exponential backoff, schema validation, and logging across all external MCP endpoints.

### 6. Multi-Session Management & Responsive UI
- **PostgreSQL Session Persistence**: Multi-session management (`sessions`, `chat_threads`, `chat_messages`), paginated sessions API (`/api/sessions`), and active thread switching.
- **Sidebar Cockpit**: Paginated browsing, dynamic thread title derivation (`deriveShortHeader`), context menu operations (inline rename, delete, archive).
- **Responsive Layout**: Fluid design system across mobile, tablet, and desktop viewports with GFM markdown tables.

### 7. 100% Python AI Service Delegation & Single-Pass RAG Engine
- **Python AI Delegation**: 100% of RAG queries, document embeddings, and PDF/CSV/Image chunking execute exclusively via Python AI service (`pythonAIServiceClient` in `grpc/client.js`).
- **Single-Pass Generation**: `generateAnswer()` in `backend/src/rag/retriever.js` generates structured markdown sections directly in ONE pass:
  - `### 📄 Executive Summary`
  - `### 🔍 Key Document Analysis & Rubric Guidelines`
  - `### 📌 Source Citations`
- **Formatter Bypass**: RAG hit queries (`decision.ragHit = true`) bypass secondary EM JSON re-formatting in `responseFormatter.js` to eliminate double-LLM latency and text degradation.

### 8. 3-Phase Enterprise Evaluation Framework (`hermes3:8b`)
- **Phase 1: Golden Dataset & Node.js Composite Evaluators**:
  - `GoldenDatasetRepository`: Schema-validated test suite (`golden-dataset.json`).
  - `MultiAgentTrajectoryStrategy`: Domain precision ($\ge 90\%$), recall, 1-tool constraint validation.
  - `RAGPipelineStrategy`: gRPC transport verification and single-pass Markdown structure check.
  - `PreLLMProcessorChain`: Map-Reduce summary density and Fast-Path $<300\text{ms}$ SLA gate.
- **Phase 2: Python LLM-as-a-Judge & Hybrid RAG Retrieval Evaluator**:
  - `LLMJudgeFactory`: G-Eval Chain-of-Thought (CoT) and Pairwise Arena dual-pass scoring.
  - `PythonRAGEvaluator`: Hybrid dense/sparse recall, context precision, HyDE synergy lift evaluation.
  - `DeepEval & Ragas`: Trajectory scoring and hybrid retrieval evaluations.
- **Phase 3: Telemetry Tracing, Local Git Hook & CI/CD Enforcement**:
  - `scoreTrace()`: Non-blocking trace score exporter to `langfuse_db` (port 5433).
  - `.git/hooks/pre-push`: Automated local pre-push git verification executing Jasmine unit tests, Python Pytests, and evaluation SLA gates.

---

## 🛠️ Development & Operational Commands

### Backend Commands (from `/backend`)
```bash
# Start development server with auto-reload
npm run dev

# Build ESM JavaScript output
npm run build

# Run unit tests with Jasmine & coverage (240 specs, 0 failures)
npm test

# Run full evaluation suite (Model: hermes3:8b)
npm run evaluate

# Run specific evaluation sub-suites
npm run eval:multi-agent
npm run eval:rag
npm run eval:pre-llm
```

### Python AI Service Commands (from `/services/python-ai-service`)
```bash
# Run Python unit & evaluation tests (39 specs, 0 failures)
uv run pytest
```

### Full Container Management (from project root)
```bash
# Build and launch all containers in background
docker compose up -d --build

# Check container health status
docker compose ps
```
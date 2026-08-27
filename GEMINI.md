# GEMINI.md - Agent & SLM Architecture Guidelines

This document outlines the architecture, routing rules, multi-agent policies, MCP integrations, and database separation of the EM TaskFlow AI platform.

---

## 🤖 Agent Architecture

The backend agent uses an **8-stage hybrid architecture** optimized for **Local SLMs (Ollama)** to process queries with high accuracy, zero double-LLM latency, and minimal prompt context bloat.

```
[ User Query + Uploads + History ]
      │
      ├── 1. Pre-LLM Preprocessing & Compression Stage
      │     ├── File Attachments ──► LangChain Map-Reduce Summarization (>15k chars)
      │     ├── RAG Candidates   ──► HyDE + Cross-Encoder Reranker + MMR Deduplication
      │     └── Chat History     ──► Recency Sliding Window + State Anchoring (>10 turns)
      │
      ├── 2. Redis Semantic Cache Check ──► Cache Hit (Cosine Sim >= 0.95) ──► Direct Cached Response (<50ms)
      │
      ├── 3. Fast-Path Classifier (<300ms) ──► Direct LLM Output (0 tools, code gen, math, chat, attachments)
      │
      └── 4. LLM Router (Ollama hermes3:8b) + Resilient JSON Fallback Parser
            │
            ├── RAG Intent ──► Single-Pass HyDE + RRF Hybrid Document Synthesis (taskflow_ai DB)
            │
            └── Multi-Domain Intent ──► LangGraph Supervisor
                                              │
                                              ├── DORA Micro-Agent (GitHub PRs/Releases + Jira Incidents + DB Fallback)
                                              ├── Delivery Micro-Agent (Jira Blockers + PR Review Bottlenecks)
                                              ├── SBI Micro-Agent (Jira Context + 1-on-1s + Slack Interactions)
                                              ├── People Micro-Agent (Google Calendar 1-on-1s + Notion Career Ladders)
                                              ├── Sprint Micro-Agent (Jira Sprint Backlog + Google Calendar PTOs)
                                              ├── Retro Micro-Agent (Thematic Clustering: Notion + Jira + Slack + GitHub)
                                              ├── Roadmap Micro-Agent (Jira Epics + GitHub Milestones + Notion Roadmaps)
                                              ├── OKR Micro-Agent (Notion OKRs + Jira Deliverables + GitHub Commits)
                                              ├── SOP Micro-Agent (Notion Policies + ADR Governance + SLAs)
                                              └── Critic Micro-Agent (Draft EM Report Audit & Dossier Review)
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
- Zero-latency pre-classifier that intercepts pure conversational, math, code-generation, or pre-extracted file attachment queries.
- Executes in **<300ms**, bypassing tool routing and RAG search overhead.

### 4. LLM Router & Resilient Fallback Parser (`llmRouter.js`)
- Analyzes domain requirements across `VALID_DOMAINS` (`dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`, `jira`, `github`, `notion`, `calendar`, `rag`).
- Outputs JSON specifying `domains`, `must_use_tools`, `allow_rag`, and `confidence`.
- Employs a resilient fallback parser (`parseStructuredDecision`) that extracts structured decisions even if the local SLM injects markdown backticks or commentary text.

### 5. Multi-Source Model Context Protocol (MCP) Tool Suite (`src/mcp/`)
- **Jira OAuth 2.0 PKCE** (`jiraOAuth.js`, `jira.js`): Automated token refresh, JQL query execution (`jira_search`), issue retrieval (`jira_get_issue`).
- **Notion REST API & OAuth 2.0** (`notionOAuth.js`, `notion.js`): Workspace search (`notion_search`), page fetch, database queries (`notion_query_database`).
- **GitHub REST API** (`githubOAuth.js`, `github.js`): Repository-scoped PAT/OAuth authentication, User-Agent header compliance, issue and PR retrieval.
- **Slack Web API** (`slack.js`): Direct channel listings (`slack_list_channels`) and message searching (`slack_search_messages`), with Temporal Human-in-the-Loop approval governance for posting (`slack_post_message`).
- **Google Calendar** (`google.js`): Dynamic calendar ID configuration, schedule inspection (`get_calendar_events`), event management.
- **Base Tool Harness** (`baseToolHarness.js`): Standardized circuit breaker pattern, exponential backoff, and execution metrics.
- **Direct API URL Resolution & Standard** (`urlHelper.js`): Resolves native URLs from API responses directly and eliminates fake domains/broken links by rendering safe monospace code blocks when unconfigured.

### 6. LangGraph Supervisor (`graph.js`)
- Uses `@langchain/langgraph-supervisor` to manage worker agent handoffs across 10 domain micro-agents.
- Enforces policy guardrails:
  - **Single Tool Rule**: Limits specialized sub-agents to **1 tool per call** to maximize SLM function-calling accuracy past 95%.
  - **Loop Prevention**: Intercepts repeated worker transitions.

### 7. Single-Pass RAG Engine & Per-Service DB (`retriever.js` & `database.py`)
- Performs **HyDE (Hypothetical Document Embeddings)** query transformation.
- Executes CTE-based **Reciprocal Rank Fusion (RRF)** merging dense `pgvector` HNSW search with sparse `pg_trgm` full-text search against the isolated `taskflow_ai` database.
- Generates structured markdown sections in a **single LLM pass** (`Executive Summary`, `Key Insights`, `Citations`), bypassing double-LLM formatting overhead.

### 8. Resilient Per-Service Database Isolation (`postgres.js`)
- **`taskflow_backend`**: Houses application sessions, chat threads, messages, `em_audit_runs`, `em_action_items`, and cached MCP fallback data (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`, `team_members`, `app_settings`).
- **`taskflow_test` & `taskflow_eval`**: Dedicated, isolated databases for Jasmine unit test specs and evaluation benchmark runs on port 5432.
- **`taskflow_ai`** (with `taskflow_ai_test` / `taskflow_ai_eval`): Houses vector document chunks (`pdf_chunks`).
- **`temporal` & `temporal_visibility`**: Houses workflow state.
- **`langfuse_db`**: Houses telemetry traces on port 5433.
- If live MCP tool servers time out, automatic fallback retrieves cached data from PostgreSQL, presenting stale-data warnings to the user.

### 9. Autonomous EM Task & Health Audit Engine & Multi-View Action Hub (`/actions`)
- **Temporal 4-Hour Durable Cron (`0 */4 * * *`)**: `emAutonomousAuditWorkflow` periodically queries all 10 domain tools and micro-agents in parallel (`harvestDoraAndDeliveryActivity`, `harvestPeopleAndCadenceActivity`, `harvestSprintAndOkrActivity`, `harvestSopAndGovernanceActivity`).
- **Synthesis & Deduplication (`synthesizeAuditAndActionItemsActivity`)**: Calculates an Engineering Health Score ($20 \le \text{Score} \le 100$) and persists deduplicated action items into `em_action_items`.
- **Multi-Channel Slack Dispatch Engine (`slack.js`)**:
  - *Consolidated Mode*: High-impact scorecard summarizing Health Score, DORA tier, sprint pacing, overdue 1-on-1s, and top 4 prioritized actions.
  - *Threaded Breakdown Mode*: Parent scorecard + 4 sub-thread replies (Delivery, People, Sprint, SOP).
  - *Targeted Action Nudges*: Instant Slack ping to assigned engineers with PR/Jira context and recommended next action.
- **Interactive EM Action Hub UI (`ActionHubPage.jsx`)**:
  - 🗂️ **Kanban Board**: 3 swimlanes (`Pending Triage`, `In Progress`, `Resolved / Completed`) with 1-click status transitions.
  - 📑 **Dense Table**: Linear/Jira-style high-density table with multi-select checkboxes for batch triage and Slack sharing.
  - 🃏 **Rich Card Grid**: Detailed cards with diagnostic descriptions, origin badges, SLA countdowns, and resolution history.
  - 🔍 **Action Inspection Drawer**: Diagnostic context, root causes, and resolution notes editor with EM attribution.
  - 👥 **Team Cadence Matrix**: Engineer 1-on-1 tracking table with promotion targets, tenure, and overdue sync alerts.

### 10. Standalone Admin Portal & Modular UI Architecture (`/admin`)
- **Global Shell & De-cluttered Viewport (`AdminShell.jsx`)**: Replaced repeated KPI strips with a compact `● System Healthy` status pill in the header. Clicking opens the slide-out **System Diagnostics Drawer** (`SystemStatusDrawer.jsx`) showing real-time health across 10 domain micro-agents, Ollama, PostgreSQL 5432, Langfuse DB 5433, and RAG vector storage.
- **Operator-First Top Navigation**: 5 primary domain groups (*Overview*, *People*, *AI Platform*, *Operations*, *Quality*) with nested sub-navigation pills for progressive disclosure (*Models & Tools*, *Services & Storage*).
- **Reusable UI Design Primitives (`frontend/src/components/admin/ui/`)**: Zero-dependency component library (`Button`, `Badge`, `StatusBadge`, `Card`, `MetricCard`, `Section`, `Tabs`, `Table`, `Drawer`, `Modal`, `Dropdown`, `SearchInput`, `EmptyState`, `Alert`) adhering to semantic dark-theme design tokens (`adminTokens.css`).
- **Readymade 8-Service Catalog**: Direct deep-links to Langfuse (:3001), Promptfoo Managed Cloud, Adminer (:8080), Temporal (:8233), Sentry, New Relic, Axiom, and Swagger REST API Explorer (:4000/api/docs).


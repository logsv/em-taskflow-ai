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
      ├── 2. 5-Tier Production Caching Suite
      │     ├── Tier 0: L1 In-Memory Exact LRU Cache (<2ms)
      │     ├── Tier 1: L2 Redis Semantic Cache (Cosine Sim >= 0.95 + Gate 2 Entity Verification) (<30ms)
      │     └── Tier 2: MCP Tool Execution Hash Cache (30s-120s TTL)
      │     └── Temporal Event-Driven Invalidation (cacheInvalidationWorkflow)
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

### 2. 5-Tier Production Caching Suite (`l1ExactCache.js`, `semanticCache.js`, `toolCache.js`, `cacheInvalidator.js`)
- **Tier 0 (L1 Exact In-Memory LRU Cache)**: Sub-millisecond ($<2\text{ms}$) turnaround for normalized identical queries scoped by domain, user, and repo.
- **Tier 1 (L2 Redis Semantic Cache with Dual-Gate Verification)**:
  - **Gate 1**: Cosine vector similarity $\ge 0.95$.
  - **Gate 2 (Anti-Hallucination Entity Filter)**: Enforces exact match on Sprint IDs, Jira keys (`ENG-1024`), user handles, and quarters. Rejects cache hits if entities diverge to prevent hallucinations.
  - **Domain-Adaptive TTLs**: 7 days for `rag`/`sop`, 4 hours for `okr`/`roadmap`, 30 minutes for `dora`/`people`, 2 minutes for `sprint`/`delivery`.
- **Tier 2 (MCP Tool Execution Cache)**: Caches read-only payloads for Jira JQL, GitHub PR listings, and Notion queries with parameter hashing.
- **Temporal Event-Driven Invalidation**: Triggers durable `cacheInvalidationWorkflow` and `invalidateCacheActivity` upon document mutations or credential updates.


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
- **🔒 Strict `app_settings` Immunity**: Live API keys (`JIRA_API_TOKEN`, `GITHUB_TOKEN`, `NOTION_API_KEY`, `GOOGLE_CALENDAR_API_KEY`, `SLACK_BOT_TOKEN`) and LLM model configurations stored in `app_settings` are strictly immune to drops, wipes, or truncation.
- **🔒 Real User Identity Immunity**: Real user accounts (`logsv`, admin profiles) in `team_members` must never be deleted during mock fixture resets.
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
- **Interactive EM Action Hub Decision Cockpit (`ActionHubPage.jsx`)**:
  - 📊 **Executive Summary**: 4 decision metric cards (Needs Attention, Overdue SLAs, Health Score with breakdown drawer, Automation status).
  - 🚨 **Needs Attention Section**: High-urgency morning triage strip with SLA countdowns and 1-click primary CTAs.
  - ⚡ **Workspace Controls**: Always-visible search with instant clear, compact Filter Popover (`⚡ Filter (N)`), active filter chips, and segmented view switcher.
  - 🗂️ **Kanban Board**: 3 swimlanes (`Pending Triage`, `In Progress`, `Resolved / Completed`) with scannable action cards (~35% more compact) and keyboard accessibility.
  - 📑 **Dense Table**: Linear/Jira-style high-density table with multi-select checkboxes for batch triage.
  - 📦 **Bulk Action Bar**: Floating bottom-center toolbar for **In Progress**, **Resolve**, **Share to Slack**, **Dismiss**, and **✕ Clear** (`Esc`).
  - 🔍 **Action Details Drawer**: Slide-out drawer with engineering impact rationale (*Why this matters*), deterministic tool signals, policy rules, and in-place resolution logger (with zero fake AI confidence scores).
  - 👥 **Team Cadence Matrix**: Engineer 1-on-1 tracking table with promotion targets, tenure, and overdue sync alerts.

### 10. Standalone Admin Portal & Modular UI Architecture (`/admin`)
- **Global Shell & De-cluttered Viewport (`AdminShell.jsx`)**: Replaced repeated KPI strips with a compact `● System Healthy` status pill in the header. Clicking opens the slide-out **System Diagnostics Drawer** (`SystemStatusDrawer.jsx`) showing real-time health across 10 domain micro-agents, Ollama, PostgreSQL 5432, Langfuse DB 5433, and RAG vector storage.
- **Operator-First Top Navigation**: 5 primary domain groups (*Overview*, *People*, *AI Platform*, *Operations*, *Quality*) with nested sub-navigation pills for progressive disclosure (*Models & Tools*, *Services & Storage*).
- **Reusable UI Design Primitives (`frontend/src/components/admin/ui/`)**: Zero-dependency component library (`Button`, `Badge`, `StatusBadge`, `Card`, `MetricCard`, `Section`, `Tabs`, `Table`, `Drawer`, `Modal`, `Dropdown`, `SearchInput`, `EmptyState`, `Alert`) adhering to semantic dark-theme design tokens (`adminTokens.css`).
- **Readymade 8-Service Catalog**: Direct deep-links to Langfuse (:3001), Promptfoo Managed Cloud, Adminer (:8080), Temporal (:8233), Sentry, New Relic, Axiom, and Swagger REST API Explorer (:4000/api/v1/docs).

### 11. Low-Distraction EM Copilot UI & Quick Actions (`⌘K`)
- **Workflow-First Philosophy**: *"Workflows are the product; agents are the implementation."* Primary chat interface is clean and free of implementation distractions (sub-agent selectors, raw tool lists, or vector chunk parameters).
- **Quick Actions Palette (`⌘K`)**: `AgentPromptPalette.jsx` enables instant workflow launching across Delivery, People, Planning, and Governance, with rich intent keyword matching and progressive disclosure scenario hints (`⋯`).
- **Decision Action Pills**: Assistant responses feature actionable pills (`[📋 Action Hub]`, `[🎯 Formulate Actions]`) connecting analysis directly to action triage.
- **Dedicated Dev Settings Modal**: `DevSettingsModal.jsx` isolates Advanced RAG mode, session/thread diagnostic copying, and PostgreSQL cache controls from the main chat viewport.

### 12. Canonical REST API Versioning & Deprecation Policy (`ADR-009`)
- **Canonical Namespace**: All REST endpoints reside under `/api/v1/*` (`/api/v1/chat`, `/api/v1/sessions`, `/api/v1/actions`, `/api/v1/admin`, `/api/v1/docs`).
- **Backward Compatibility**: Legacy `/api/*` requests are aliased and forwarded to `/api/v1/*` with HTTP `Deprecation: true`, `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`, and `Link: </api/v1/...>; rel="successor-version"` headers.
- **Frontend Client Centralization**: Single `apiClient.js` module standardizes base path and session token injection.




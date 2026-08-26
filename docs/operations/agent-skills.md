# 🧰 Agent Skills & Operational Playbooks

This guide provides documentation for the **13 Specialized Operational Skills** configured for autonomous AI agents (Codex, Claude Code, Gemini CLI, Antigravity) and human software engineers maintaining the EM TaskFlow AI platform.

All skills are maintained as standard Markdown operational playbooks under [`.agents/skills/`](https://github.com/logsv/em-taskflow-ai/tree/main/.agents/skills) with an index in [`SKILLS.md`](https://github.com/logsv/em-taskflow-ai/blob/main/SKILLS.md).

---

## 📑 Categorized Skills Directory

### 1. 👑 Multi-Agent Orchestration & SLM Inference

#### `domain-micro-agent-ops`
- **Location**: `.agents/skills/domain-micro-agent-ops/SKILL.md`
- **Purpose**: Operational procedures for managing, testing, and adding the 10 Engineering Manager domain micro-agents, deterministic 1-tool harnesses, and policy guardrail validation.
- **Key Verification**:
  ```bash
  cd backend && npm test # Verifies all 240 unit test specs
  ```

#### `langgraph-slm-agent`
- **Location**: `.agents/skills/langgraph-slm-agent/SKILL.md`
- **Purpose**: Managing LangGraph supervisor routing, sub-agent tool bounding, loop prevention, and local Ollama SLM execution (`hermes3:8b`).
- **Core Rule**: Limits specialized sub-agents to **at most 1 tool definition per call**, elevating tool execution accuracy above 95%.

#### `ollama-slm-ops`
- **Location**: `.agents/skills/ollama-slm-ops/SKILL.md`
- **Purpose**: Managing local Ollama SLM inference (`hermes3:8b`, `mistral`, `nomic-embed-text`), zero-cloud key policies, and model parameter tuning.

#### `pre-llm-compression-ops`
- **Location**: `.agents/skills/pre-llm-compression-ops/SKILL.md`
- **Purpose**: Pre-LLM Preprocessing Suite, LangChain Map-Reduce file compression (>15k chars), Cross-Encoder reranking with MMR deduplication, and sliding window chat history state anchoring (>10 turns).

---

### 2. 🔌 MCP Integrations & Tool Ecosystem

#### `mcp-integrations-ops`
- **Location**: `.agents/skills/mcp-integrations-ops/SKILL.md`
- **Purpose**: Operational management of Jira OAuth 2.0 PKCE, Notion REST API, GitHub PAT/OAuth with repository scoping, Slack Web API, and Google Calendar dynamic ID tools.
- **Key Component**: Standardized `BaseToolHarness` circuit breaker with exponential backoff and PostgreSQL fallback schemas.

#### `github-sync-fallback`
- **Location**: `.agents/skills/github-sync-fallback/SKILL.md`
- **Purpose**: Testing live GitHub REST API sync, repo-scoped PAT authentication, dual DB cache snapshot fallback (`github_issues`), and manual UI refresh triggers.

---

### 3. 🗄️ Database, Storage & Hybrid RAG

#### `db-per-service-ops`
- **Location**: `.agents/skills/db-per-service-ops/SKILL.md`
- **Purpose**: Procedures for managing isolated PostgreSQL microservice databases:
  - `taskflow_backend` (Port 5432) - Node.js Backend API
  - `taskflow_ai` (Port 5432) - Python AI RAG & Vector Embeddings
  - `temporal` & `temporal_visibility` (Port 5432) - Temporal Orchestration
  - `langfuse_db` (Port 5433) - Telemetry & Tracing Database

#### `rag-pdf-ingestion`
- **Location**: `.agents/skills/rag-pdf-ingestion/SKILL.md`
- **Purpose**: Testing multi-format document ingestion (PDF, CSV, Images OCR, Text), HyDE query transformation, CTE-based RRF hybrid search, Redis semantic caching, and single-pass RAG synthesis.

#### `session-thread-management-ops`
- **Location**: `.agents/skills/session-thread-management-ops/SKILL.md`
- **Purpose**: Managing PostgreSQL multi-session persistence, chat threads, pagination, context menus, thread renaming, and dynamic title derivation.

---

### 4. 📊 Observability, Evaluations & Operations

#### `admin-portal-ops`
- **Location**: `.agents/skills/admin-portal-ops/SKILL.md`
- **Purpose**: Operational management of the Standalone Admin Portal (`/admin`), external service launchers (Langfuse, Promptfoo, Adminer, Temporal), DORA metrics tier ratings, vector chunk inspection, and Express admin APIs.

#### `em-dora-productivity-ops`
- **Location**: `.agents/skills/em-dora-productivity-ops/SKILL.md`
- **Purpose**: Tracking, testing, and managing Engineering Manager (EM) DORA productivity metrics (tier ratings), Sprint health analytics, OKRs, and SBI feedback records.

#### `enterprise-evaluation-framework-ops`
- **Location**: `.agents/skills/enterprise-evaluation-framework-ops/SKILL.md`
- **Purpose**: Managing, executing, and calibrating the 3-Phase Enterprise Evaluation Framework (`hermes3:8b`), strategy evaluators, DeepEval, Ragas, TruLens, and CI/CD pre-push verification gates.
- **Key Command**:
  ```bash
  npm run eval:enterprise
  ```

#### `langfuse-analytics-migration`
- **Location**: `.agents/skills/langfuse-analytics-migration/SKILL.md`
- **Purpose**: Operational guidelines for self-hosted Langfuse telemetry (port 3001), non-blocking tracing, and isolated `analytics-db` (`langfuse_db` on port 5433).

---

## 🛠️ How AI Agents Discover and Execute Skills

1. **Autonomous Discovery**: Agents inspect `SKILLS.md` and match user requests to the appropriate operational skill.
2. **Context Ingestion**: The agent loads the designated `SKILL.md` into context using file viewing tools before making source code edits.
3. **Deterministic Verification**: Every skill defines exact CLI test commands that must be executed upon completing code changes, ensuring all **240 backend unit test specs** and **39 Python AI test specs** pass with 0 failures.

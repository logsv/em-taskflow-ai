# 🧰 EM TaskFlow AI - Agent Skills Index

This document provides a comprehensive sitemap and directory of operational skills created for AI agents (Codex, Claude Code, Gemini CLI, Antigravity) working in the EM TaskFlow AI repository.

---

## 📑 Available Agent Skills by Category

### 1. 👑 Multi-Agent Orchestration & SLM Inference
| Skill Name | Path | Description |
| :--- | :--- | :--- |
| **`domain-micro-agent-ops`** | [`.agents/skills/domain-micro-agent-ops/SKILL.md`](file://.agents/skills/domain-micro-agent-ops/SKILL.md) | Operations for managing, testing, and extending the 10 EM domain micro-agents, 1-tool deterministic harnesses, and policy guardrails. |
| **`langgraph-slm-agent`** | [`.agents/skills/langgraph-slm-agent/SKILL.md`](file://.agents/skills/langgraph-slm-agent/SKILL.md) | Procedures for managing LangGraph supervisor routing, sub-agent tool bounding, loop prevention, and local Ollama SLM execution. |
| **`ollama-slm-ops`** | [`.agents/skills/ollama-slm-ops/SKILL.md`](file://.agents/skills/ollama-slm-ops/SKILL.md) | Procedures for managing local Ollama SLM inference (`hermes3:8b`, `mistral`, `nomic-embed-text`), zero-cloud key policies, and SLM parameters. |
| **`pre-llm-compression-ops`** | [`.agents/skills/pre-llm-compression-ops/SKILL.md`](file://.agents/skills/pre-llm-compression-ops/SKILL.md) | Operations for Pre-LLM Preprocessing Suite, LangChain Map-Reduce file compression (>15k chars), Cross-Encoder reranking + MMR, and Chat History state anchoring. |

### 2. 🔌 MCP Integrations & Tool Ecosystem
| Skill Name | Path | Description |
| :--- | :--- | :--- |
| **`mcp-integrations-ops`** | [`.agents/skills/mcp-integrations-ops/SKILL.md`](file://.agents/skills/mcp-integrations-ops/SKILL.md) | Operations for Jira OAuth 2.0 PKCE, Notion REST API, GitHub PAT/OAuth, Slack Web API, Google Calendar, Base Tool Harness circuit breaking, and DB fallbacks. |
| **`github-sync-fallback`** | [`.agents/skills/github-sync-fallback/SKILL.md`](file://.agents/skills/github-sync-fallback/SKILL.md) | Procedures for testing live GitHub REST API sync, repo-scoped PAT authentication, dual DB cache snapshot fallback (`github_issues`), and manual UI refresh. |

### 3. 🗄️ Database, Storage & Hybrid RAG
| Skill Name | Path | Description |
| :--- | :--- | :--- |
| **`db-per-service-ops`** | [`.agents/skills/db-per-service-ops/SKILL.md`](file://.agents/skills/db-per-service-ops/SKILL.md) | Procedures for managing isolated microservice databases (`taskflow_backend:5432`, `taskflow_ai:5432`, `temporal:5432`, `langfuse_db:5433`), SQL init scripts, and verification commands. |
| **`rag-pdf-ingestion`** | [`.agents/skills/rag-pdf-ingestion/SKILL.md`](file://.agents/skills/rag-pdf-ingestion/SKILL.md) | Testing multi-format document ingestion (PDF, CSV, Images OCR, Text), HyDE query transformation, CTE-based RRF hybrid search, Redis semantic cache, and single-pass RAG synthesis. |
| **`session-thread-management-ops`** | [`.agents/skills/session-thread-management-ops/SKILL.md`](file://.agents/skills/session-thread-management-ops/SKILL.md) | Procedures for managing PostgreSQL session persistence, chat threads, pagination, context menus, thread renaming, and dynamic title derivation. |

### 4. 📊 Observability, Evaluations & Operations
| Skill Name | Path | Description |
| :--- | :--- | :--- |
| **`admin-portal-ops`** | [`.agents/skills/admin-portal-ops/SKILL.md`](file://.agents/skills/admin-portal-ops/SKILL.md) | Managing the Standalone Admin Portal (`/admin`), external service hubs (Langfuse, Promptfoo, Adminer, Temporal), DORA tier ratings, vector chunk inspection, and Express admin APIs. |
| **`em-dora-productivity-ops`** | [`.agents/skills/em-dora-productivity-ops/SKILL.md`](file://.agents/skills/em-dora-productivity-ops/SKILL.md) | Tracking, testing, and managing Engineering Manager (EM) DORA productivity metrics (tier ratings), Sprint health analytics, OKRs, and SBI feedback records. |
| **`enterprise-evaluation-framework-ops`** | [`.agents/skills/enterprise-evaluation-framework-ops/SKILL.md`](file://.agents/skills/enterprise-evaluation-framework-ops/SKILL.md) | Managing, executing, and calibrating the 3-Phase Enterprise Evaluation Framework (`hermes3:8b`), strategy evaluators, DeepEval, Ragas, TruLens, and CI/CD pre-push gates. |
| **`langfuse-analytics-migration`** | [`.agents/skills/langfuse-analytics-migration/SKILL.md`](file://.agents/skills/langfuse-analytics-migration/SKILL.md) | Guidelines for self-hosted Langfuse telemetry (port 3001), non-blocking tracing, and isolated `analytics-db` (`langfuse_db` on port 5433). |

---

## 🛠️ How to Use Skills in Agent Workflows

When performing complex development or operational tasks:
1. Locate the relevant skill from the categorized directory above.
2. Read the skill's `SKILL.md` using `view_file` before executing changes.
3. Follow the empirical verification commands listed in the skill to ensure zero regressions across all **240 backend unit test specs** and **39 Python AI test specs**.

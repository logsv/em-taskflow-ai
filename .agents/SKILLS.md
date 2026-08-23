# 🧰 EM TaskFlow AI - Agent Skills Index

This document provides a sitemap and directory of operational skills created for AI agents (Codex, Gemini CLI, Antigravity) working in the EM TaskFlow AI repository.

---

## 📑 Available Agent Skills

| Skill Name | Path | Description |
| :--- | :--- | :--- |
| **`admin-portal-ops`** | [`skills/admin-portal-ops/SKILL.md`](file://.agents/skills/admin-portal-ops/SKILL.md) | Operations for managing the Standalone Admin Portal (`/admin`), external service hubs (Langfuse, Promptfoo, Adminer, Temporal), DORA tier ratings, vector chunk inspection, and Express administrative APIs. |
| **`db-per-service-ops`** | [`skills/db-per-service-ops/SKILL.md`](file://.agents/skills/db-per-service-ops/SKILL.md) | Operational procedures for managing isolated microservice databases (`taskflow_backend`, `taskflow_ai`, `temporal`, `langfuse_db`), SQL init scripts, and verification commands. |
| **`domain-micro-agent-ops`** | [`skills/domain-micro-agent-ops/SKILL.md`](file://.agents/skills/domain-micro-agent-ops/SKILL.md) | Operational procedures for managing, testing, and adding the 10 EM domain micro-agents, 1-tool deterministic harnesses, multi-source MCP integrations, and policy guardrails. |
| **`em-dora-productivity-ops`** | [`skills/em-dora-productivity-ops/SKILL.md`](file://.agents/skills/em-dora-productivity-ops/SKILL.md) | Procedures for tracking, testing, and managing Engineering Manager (EM) DORA productivity metrics (tier ratings), Sprint health analytics, OKRs, and SBI feedback records. |
| **`enterprise-evaluation-framework-ops`** | [`skills/enterprise-evaluation-framework-ops/SKILL.md`](file://.agents/skills/enterprise-evaluation-framework-ops/SKILL.md) | Operational procedures for managing, executing, calibrating, and extending the 3-Phase Enterprise Evaluation Framework (`hermes3:8b`), strategy evaluators, DeepEval, Ragas, and CI/CD gates. |
| **`github-sync-fallback`** | [`skills/github-sync-fallback/SKILL.md`](file://.agents/skills/github-sync-fallback/SKILL.md) | Procedures for testing live GitHub REST API sync, repo-scoped PAT authentication, dual DB cache snapshot fallback (`github_issues`), and manual UI refresh. |
| **`langfuse-analytics-migration`** | [`skills/langfuse-analytics-migration/SKILL.md`](file://.agents/skills/langfuse-analytics-migration/SKILL.md) | Operational guidelines for self-hosted Langfuse telemetry (port 3001), non-blocking tracing, and isolated `analytics-db` (`langfuse_db` on port 5433). |
| **`langgraph-slm-agent`** | [`skills/langgraph-slm-agent/SKILL.md`](file://.agents/skills/langgraph-slm-agent/SKILL.md) | Procedures for managing LangGraph supervisor routing, 10 domain micro-agent tool bounding, and local Ollama SLM execution (`hermes3:8b`). |
| **`mcp-integrations-ops`** | [`skills/mcp-integrations-ops/SKILL.md`](file://.agents/skills/mcp-integrations-ops/SKILL.md) | Operations for managing Jira OAuth 2.0 PKCE, Notion REST API, GitHub PAT/OAuth, Slack Web API, Google Calendar MCP, Base Tool Harness circuit breaking, and PostgreSQL fallbacks. |
| **`ollama-slm-ops`** | [`skills/ollama-slm-ops/SKILL.md`](file://.agents/skills/ollama-slm-ops/SKILL.md) | Procedures for managing local Ollama SLM inference (`hermes3:8b`, `mistral`, `nomic-embed-text`) and model parameters. |
| **`pre-llm-compression-ops`** | [`skills/pre-llm-compression-ops/SKILL.md`](file://.agents/skills/pre-llm-compression-ops/SKILL.md) | Operational procedures for the Pre-LLM Preprocessing Suite, Map-Reduce file compression, Cross-Encoder reranking, and Chat History state anchoring. |
| **`rag-pdf-ingestion`** | [`skills/rag-pdf-ingestion/SKILL.md`](file://.agents/skills/rag-pdf-ingestion/SKILL.md) | Procedures for testing document ingestion (PDF, CSV, Image), Python AI gRPC/REST delegation, HyDE query transformation, RRF hybrid search, Redis semantic cache, and single-pass RAG synthesis. |
| **`session-thread-management-ops`** | [`skills/session-thread-management-ops/SKILL.md`](file://.agents/skills/session-thread-management-ops/SKILL.md) | Procedures for managing PostgreSQL session persistence, chat threads, pagination, context menus, thread renaming, and dynamic title derivation. |

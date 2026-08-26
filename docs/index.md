---
layout: home

hero:
  name: "EM TaskFlow AI"
  text: "Enterprise Productivity with 100% Local Inference"
  tagline: "Hybrid RAG • LangGraph Multi-Agent Supervisor • Multi-Source MCP • Database-per-Service Isolation"
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/overview
    - theme: alt
      text: Architecture Blueprint
      link: /architecture/high-level-design
    - theme: alt
      text: Agent Skills & Playbooks
      link: /operations/agent-skills
    - theme: alt
      text: Swagger API Explorer ↗
      link: http://localhost:4000/api/docs

features:
  - icon: 🔒
    title: 100% Data Sovereignty
    details: Zero cloud keys required. Complete local inference using Ollama (hermes3:8b) ensures enterprise source code and metrics never leave private network boundaries.
  - icon: 👑
    title: LangGraph Multi-Agent Supervisor
    details: 10 bounded domain micro-agents orchestrating DORA, Delivery, SBI, People, Sprint, Retro, Roadmap, OKR, SOP, and Critic workflows with 1-tool SLM bounding (>95% accuracy).
  - icon: 🔍
    title: Production Hybrid RAG Engine
    details: Dense HNSW vector cosine search + Sparse BM25 full-text search combined via Reciprocal Rank Fusion (RRF SQL CTE) with HyDE query transformation and Cross-Encoder reranking.
  - icon: 🔌
    title: Multi-Source MCP Integrations
    details: Native Jira OAuth 2.0 PKCE, Notion REST API, GitHub PAT/OAuth with repo scoping, Slack Web API, and Google Calendar tool harnesses with circuit breakers.
  - icon: 🗄️
    title: Database-per-Service Isolation
    details: Strict PostgreSQL database boundaries between taskflow_backend, taskflow_ai (vector chunks), temporal, and isolated analytics-db (langfuse_db:5433).
  - icon: ⚡
    title: Redis Semantic Cache & Fast-Path
    details: Vector similarity caching (0.95 cosine threshold) for <50ms cache hits and Fast-Path regex classifier for <300ms direct math, code, and attachment execution.
  - icon: 🧪
    title: 3-Phase Enterprise Evaluation
    details: Golden dataset validation, Python LLM-as-a-Judge CoT, DeepEval trajectories, Ragas faithfulness, and TruLens RAG triad benchmarks.
  - icon: 🧰
    title: 13 Specialized Agent Skills
    details: Standardized operational playbooks for autonomous agents and human developers covering multi-agent routing, MCP harnesses, and database ops.
  - icon: 🛡️
    title: 269+ Verified Unit Specs
    details: 269 backend unit test specs and 45 Python AI test specs passing with 0 failures under automated pre-push and CI/CD gates.
---

---
layout: home

hero:
  name: "EM TaskFlow AI"
  text: "Enterprise Productivity with 100% Local Inference"
  tagline: "Hybrid RAG • LangGraph Multi-Agent Supervisor • Autonomous Temporal Jobs • 5-Tier Caching • Database-per-Service Isolation"
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/overview
    - theme: alt
      text: Architecture Blueprint
      link: /architecture/high-level-design
    - theme: alt
      text: Autonomous Jobs
      link: /autonomous-jobs/autonomous-audit-engine
    - theme: alt
      text: UI & Action Hub
      link: /frontend/overview
    - theme: alt
      text: Swagger Explorer ↗
      link: http://localhost:4000/api/v1/docs

features:
  - icon: 🔒
    title: 100% Data Sovereignty
    details: Zero cloud keys required. Complete local inference using Ollama (hermes3:8b) ensures enterprise source code, 1-on-1s, and metrics never leave private network boundaries.
  - icon: 👑
    title: LangGraph Multi-Agent Supervisor
    details: 10 bounded domain micro-agents orchestrating DORA, Delivery, SBI, People, Sprint, Retro, Roadmap, OKR, SOP, and Critic workflows with 1-tool SLM bounding (>95% accuracy).
  - icon: ⚡
    title: Autonomous EM Jobs & Workflows
    details: Temporal 4-hour background audit cron, durable Human-in-the-Loop Slack approval queues, cross-platform team auto-discovery, and event-driven cache invalidation.
  - icon: 💻
    title: Copilot Cockpit & Action Hub
    details: Low-distraction ⌘K Quick Actions Palette, morning Needs Attention strip, Kanban vs Dense Table triage, Floating Bulk Action Bar, and Standalone Admin Portal (/admin).
  - icon: 🔍
    title: Production Hybrid RAG Engine
    details: 100% Python AI Service delegation via gRPC, HyDE query expansion, HNSW dense + BM25 sparse RRF search, and single-pass markdown generation with formatter bypass.
  - icon: ⚡
    title: 5-Tier Production Caching Suite
    details: Sub-2ms Tier 0 L1 exact LRU cache, Tier 1 L2 Redis vector semantic cache with Dual-Gate anti-hallucination verification, Tier 2 MCP tool hash cache, and adaptive TTLs.
  - icon: 🔌
    title: Multi-Source MCP Integrations
    details: Native Jira OAuth 2.0 PKCE, Notion REST API, GitHub PAT/OAuth with repo scoping, Slack Web API, and Google Calendar tool harnesses with circuit breakers.
  - icon: 🗄️
    title: Database-per-Service Isolation
    details: Strict PostgreSQL database boundaries between taskflow_backend, taskflow_ai (vector chunks), temporal, and isolated analytics-db (langfuse_db:5433) with key preservation.
  - icon: 🧪
    title: 3-Phase Enterprise Evaluation
    details: Golden dataset validation, Python LLM Judge Arena, EM Tau-Bench multi-turn simulation, DeepEval trajectories, Ragas faithfulness, and Promptfoo Cloud benchmarks.
  - icon: 🛡️
    title: 394 Backend & 57 Python Specs
    details: Full test coverage across 394 Node.js Jasmine specs and 57 Python Pytest specs passing with 0 failures under pre-push verification gates.
---

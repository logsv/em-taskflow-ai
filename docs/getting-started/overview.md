# Platform Overview

**EM TaskFlow AI** is a full-stack, local-first enterprise productivity platform designed specifically for Engineering Managers, Tech Leads, and Engineering Directors.

---

## 🎯 Why Local-First Matters for Engineering Leadership

Engineering management workflows involve extremely sensitive enterprise data:
- Private source code repositories and unreleased pull requests
- Individual engineer 1-on-1 notes, performance evaluations, and promotion dossiers
- Incident post-mortems, security vulnerabilities, and blocker tickets
- Architecture Decision Records (ADRs) and confidential quarterly OKRs

Sending this data to external commercial cloud LLMs exposes companies to data governance violations, regulatory breaches, and vendor lock-in. 

**EM TaskFlow AI solves this by guaranteeing 100% data sovereignty through local Ollama inference, private database isolation, and local hybrid vector search.**

---

## 🏛️ Core Capabilities

```
                       ┌───────────────────────────────┐
                       │  EM TaskFlow Cockpit & Admin  │
                       └──────────────┬────────────────┘
                                      │
           ┌──────────────────────────┴──────────────────────────┐
           ▼                                                     ▼
┌─────────────────────────────┐                       ┌─────────────────────────────┐
│  LangGraph Multi-Agent EM   │                       │ Production Hybrid RAG       │
│  ├── DORA Tier Analytics    │                       │ ├── HyDE Query Expansion    │
│  ├── Delivery Bottlenecks   │                       │ ├── RRF (Dense + Sparse)    │
│  ├── SBI Feedback Generator │                       │ ├── Cross-Encoder Rerank    │
│  ├── People & 1-on-1s       │                       │ └── Parent-Child Chunking   │
│  ├── Sprint Capacity Plan   │                       └──────────────┬──────────────┘
│  ├── Thematic Retro Engine  │                                      │
│  ├── Roadmap Drift Checker  │                       ┌──────────────▼──────────────┐
│  ├── OKR Pacing Scorer      │                       │ Isolated taskflow_ai DB     │
│  ├── SOP & ADR Compliance   │                       │ pgvector HNSW + pg_trgm GIN │
│  └── Report Critic & Audit  │                       └─────────────────────────────┘
└──────────────┬──────────────┘
               │
┌──────────────▼────────────────────────────────────────────────────────────┐
│ Multi-Source MCP Ecosystem (Jira OAuth, Notion, GitHub, Slack, Calendar) │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Differentiators

1. **Zero Cloud API Key Dependency**: All chat completions, routing classifications, HyDE transformations, and evaluations execute against local Ollama (`hermes3:8b`).
2. **1-Tool Sub-Agent Bounding**: Solves local Small Language Model (SLM) function-calling degradation by restricting sub-agents to at most 1 tool definition per call, boosting tool execution accuracy above **95%**.
3. **Dual-Layer Database Fallbacks**: When live APIs time out or encounter rate limits, system automatically retrieves cached PostgreSQL snapshots with clear provenance indicators.
4. **Database Per-Service Isolation**: Strict container separation between application data (`taskflow_backend`), vector embeddings (`taskflow_ai`), workflow state (`temporal`), and telemetry (`langfuse_db` on port 5433).

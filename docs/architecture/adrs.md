# Architecture Decision Records (ADRs)

This document records the foundational architectural decisions, rationale, and trade-offs made in the design of EM TaskFlow AI.

---

## 📜 ADR-001: 100% Local Inference & Data Sovereignty
- **Status**: Accepted
- **Context**: Engineering managers process confidential engineering discussions, unreleased code, and personnel performance evaluations.
- **Decision**: All inferences must execute locally against Ollama (`hermes3:8b`, `nomic-embed-text`). All external cloud API keys (OpenAI, Anthropic, Gemini) are disabled (`LLM_GOOGLE_ENABLED: false`, `LLM_OPENAI_ENABLED: false`).
- **Consequences**: Zero corporate data leaves private network boundaries. Hardware requires minimum 8GB RAM.

---

## 📜 ADR-002: Bounded 1-Tool Sub-Agent Policy
- **Status**: Accepted
- **Context**: Local 3B-8B parameter Small Language Models experience sharp accuracy drops and hallucinations when presented with $>5$ tools simultaneously.
- **Decision**: Restrict each specialized ReAct micro-agent in the LangGraph supervisor to strictly 1 tool definition per invocation.
- **Consequences**: Increases tool calling accuracy above 95% on local SLMs while keeping individual agent prompts concise and focused.

---

## 📜 ADR-003: Database Per-Service Isolation
- **Status**: Accepted
- **Context**: Mixing RAG document embeddings, application sessions, workflow queue states, and analytical telemetry in a single database creates indexing contention and cross-domain pollution.
- **Decision**: Separate databases into `taskflow_backend` (Express state), `taskflow_ai` (vector embeddings), `temporal` (workflow state), and `langfuse_db` (port 5433 on container `analytics-db`).
- **Consequences**: Strict domain boundaries. Telemetry failures can never crash or lock application tables.

---

## 📜 ADR-004: Hybrid RAG (HyDE + RRF + HNSW + BM25)
- **Status**: Accepted
- **Context**: Pure vector cosine search frequently misses exact keyword hits (e.g. acronyms, ticket IDs, policy names), while pure keyword search lacks semantic nuance.
- **Decision**: Combine dense cosine distance (`<=>` HNSW) and sparse trigram BM25 (`pg_trgm`) via Reciprocal Rank Fusion ($1.0 / (60 + \text{rank})$) in a single SQL CTE query.
- **Consequences**: High precision and recall across both conceptual and exact keyword queries.

---

## 📜 ADR-005: Redis Semantic Vector Cache
- **Status**: Accepted
- **Context**: Repeated similar queries create redundant SLM inference latency and GPU overhead.
- **Decision**: Intercept incoming queries using Redis vector similarity with a 0.95 cosine threshold and 1-hour TTL.
- **Consequences**: Sub-50ms response times for recurring team queries with zero LLM generation cost.

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
- **Decision**: Intercept incoming queries using Redis vector similarity with a 0.95 cosine threshold and domain-adaptive TTLs.
- **Consequences**: Sub-50ms response times for recurring team queries with zero LLM generation cost.

---

## 📜 ADR-006: 100% Python AI Service Delegation & Single-Pass RAG
- **Status**: Accepted
- **Context**: Running embeddings and chunking in Node.js leads to heavy event loop blocking and inconsistent tokenizers. Double-LLM JSON re-formatting adds latency.
- **Decision**: Delegate 100% of RAG chunking, embeddings, and vector operations to a dedicated Python AI Service over gRPC (`ai_service_grpc.py`) with REST fallback. Generate formatted markdown sections directly in a single pass (`Executive Summary`, `Key Insights`, `Citations`), bypassing secondary JSON formatting.
- **Consequences**: Sub-2s RAG turnaround with superior semantic retrieval.

---

## 📜 ADR-007: 5-Tier Production Caching & Dual-Gate Entity Verification
- **Status**: Accepted
- **Context**: Vector similarity cache hits can hallucinate if similar queries mention different entity keys (e.g. `PR #89` vs `PR #92` or `Sprint 41` vs `Sprint 42`).
- **Decision**: Implement a 5-tier caching suite with Dual-Gate Verification (Gate 1 cosine $\ge 0.95$, Gate 2 Strict Anti-Hallucination Entity Alignment check), MCP tool hash cache, and Temporal event-driven cache invalidations.
- **Consequences**: Completely eliminates false entity cache hits while serving repeat queries in $<2\text{ms}$.

---

## 📜 ADR-008: Autonomous Multi-Agent EM Audit & Health Governance
- **Status**: Accepted
- **Context**: Continuous engineering health oversight requires scheduled, durable polling of multi-source tools without manual manager intervention.
- **Decision**: Implement a Temporal 4-hour background cron (`0 */4 * * *`) that orchestrates 4 parallel domain harvests, calculates an Engineering Health Score ($20 \le \text{Score} \le 100$), deduplicates action items into PostgreSQL, and provides multi-channel Slack dispatch and an interactive Action Hub (`/actions`).
- **Consequences**: Autonomous, proactive engineering management decision support.

---

## 📜 ADR-009: API Versioning Strategy & URI Namespace Policy
- **Status**: Accepted
- **Context**: Contract evolution requires strict version boundaries to prevent breaking existing sessions, webhooks, and client UI.
- **Decision**: 
  1. Adopt canonical URI path versioning: `/api/v1/*` for all REST endpoints and OpenAPI 3.1 specifications (`/api/v1/docs/openapi.json`).
  2. Maintain legacy unversioned `/api/*` as an aliased backward-compatibility proxy emitting HTTP `Deprecation: true`, `Sunset`, and `Link: </api/v1/...>; rel="successor-version"` headers alongside `X-API-Version: v1`.
  3. Centralize frontend API communication via `apiClient.js`.
- **Consequences**: Non-breaking zero-downtime migrations and clean Swagger UI exploration.

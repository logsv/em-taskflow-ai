---
name: multi-tier-caching-ops
description: Procedures for managing, configuring, testing, and invalidating the 5-Tier Production Caching Architecture, L1 In-Memory exact LRU cache, L2 Redis vector semantic cache with Dual-Gate anti-hallucination verification, Tier 2 MCP tool cache, and Temporal durable event-driven invalidation in EM TaskFlow AI.
---

# Multi-Tier Production Caching & Temporal Invalidation Skill

Use this skill when developing, testing, maintaining, or troubleshooting caching layers, cache eviction, latency bottlenecks, anti-hallucination dual-gate filtering, adaptive domain TTLs, and Temporal event-driven cache invalidations.

---

## 📌 Multi-Tier Caching Architecture

```
[ User Query + Context (User, Repo, Domain) ]
                     │
┌────────────────────▼────────────────────┐
│  Tier 0: L1 In-Memory Exact LRU Cache   │ ──► Hit (<2ms) ──► Return Instant Cached Answer
│  (backend/src/cache/l1ExactCache.js)    │
└────────────────────┬────────────────────┘
                     │ Miss
┌────────────────────▼────────────────────┐
│  Tier 1: L2 Redis Semantic Cache        │ ──► Dual-Gate Filter:
│  (backend/src/cache/semanticCache.js)   │     1. Gate 1: Cosine Sim >= 0.95
│                                         │     2. Gate 2: Exact Entity Alignment Check
│                                         │        (Sprint IDs, Jira Keys, Quarters, Users)
│                                         │     └──► PASS: Return Cached Answer (<30ms)
│                                         │     └──► DIVERGE: Reject (Anti-Hallucination)
└────────────────────┬────────────────────┘
                     │ Miss
┌────────────────────▼────────────────────┐
│  Tier 2: MCP Tool Execution Cache       │ ──► Hash-keyed tool results (30s-120s TTL)
│  (backend/src/cache/toolCache.js)       │     (Jira search, GitHub PR listings, Notion)
└────────────────────┬────────────────────┘
                     │ Miss
┌────────────────────▼────────────────────┐
│  RAG Retriever / Multi-Agent Supervisor │ ──► Executes live query ──► Writes to L1, L2, Tool
└─────────────────────────────────────────┘
```

---

## ⏱️ Domain-Adaptive Volatility TTLs

Monolithic TTLs are strictly prohibited. The system applies adaptive TTLs based on underlying domain volatility:

| Domain | TTL | Rationale | Invalidation Trigger |
| :--- | :--- | :--- | :--- |
| `rag` & `sop` | **7 Days** (`604,800s`) | Static architecture docs, policies, ADRs | PDF ingestion / deletion events |
| `okr` & `roadmap` | **4 Hours** (`14,400s`) | Quarterly planning, milestone alignment | Admin flush / setting updates |
| `dora` & `people` | **30 Minutes** (`1,800s`) | Weekly metrics, 1-on-1 cadence | Background sync completion |
| `sprint` & `delivery` | **2 Minutes** (`120s`) | Active sprint blockers, live PR turnaround | Live issue mutation / short TTL |

---

## 🛡️ Anti-Hallucination Dual-Gate Filter

1. **Gate 1 (Semantic Embedding Distance)**: Query vector cosine similarity $\ge 0.95$.
2. **Gate 2 (Deterministic Entity Verification)**:
   - Evaluates Sprint IDs (e.g., `Sprint 45` vs `Sprint 44`), Jira Keys (`ENG-1024`), Quarters (`Q3 2026`), and User Handles (`@alex`).
   - If extracted entities diverge between query and cached metadata, the hit is **rejected immediately** and sent to live LLM generation.

---

## ⚡ Temporal Event-Driven Invalidation Workflows & Activities

Instead of adding separate queue or pub/sub infrastructure (BullMQ, Kafka, Redis queue), all event-driven cache clears are coordinated through **Temporal**:

1. **Workflow**: `cacheInvalidationWorkflow` in `backend/src/temporal/workflows.js`.
2. **Activity**: `invalidateCacheActivity` in `backend/src/temporal/activities.js`.
3. **Dispatcher**: `startCacheInvalidationWorkflow(params)` in `backend/src/temporal/client.js` with direct fallback when offline.

---

## 🛠️ Admin Management APIs

```bash
# Get live metrics across L1 in-memory, L2 Redis, and Tier 2 tool caches
curl -s http://localhost:4000/api/v1/admin/cache/stats

# Flush specific domain cache entries
curl -X POST http://localhost:4000/api/v1/admin/cache/flush \
  -H "Content-Type: application/json" \
  -d '{"domain": "sprint"}'

# Flush document-specific cache entries upon mutation
curl -X POST http://localhost:4000/api/v1/admin/cache/flush \
  -H "Content-Type: application/json" \
  -d '{"documentFilename": "code_review_policy.pdf"}'

# Flush all cache tiers
curl -X POST http://localhost:4000/api/v1/admin/cache/flush \
  -H "Content-Type: application/json" \
  -d '{"all": true}'
```

---

## 🧪 Verification Commands

```bash
# Run full backend unit & cache suite (394 specs, 0 failures)
cd backend && npm test

# Run multi-tier cache spec directly
cd backend && npx jasmine test/cache/multiTierCache.spec.js

# Run admin cache routes spec directly
cd backend && npx jasmine test/routes/adminCacheRoutes.spec.js
```

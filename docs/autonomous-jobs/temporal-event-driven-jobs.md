# ⏳ Temporal Event-Driven & Scheduled Jobs

EM TaskFlow AI utilizes **Temporal** for durable background execution, distributed job queues, event-driven cache invalidation, and scheduled multi-agent benchmarking.

---

## 🏗️ The Temporal Workflows Catalog

| Workflow Name | Queue Name | Trigger Mechanism | Purpose |
| :--- | :--- | :--- | :--- |
| **`emAutonomousAuditWorkflow`** | `em-audit-queue` | Temporal Cron `0 */4 * * *` or UI Trigger | Orchestrates 4 parallel domain harvests, synthesizes health score, and dispatches Slack notifications. |
| **`slackPostHITLWorkflow`** | `slack-hitl-queue` | Agent/Admin Slack Request | Holds draft retrospective summaries in an approval queue with a 60-minute window for human sign-off. |
| **`teamAutoDiscoveryWorkflow`** | `team-sync-queue` | Admin UI or First-Boot Auto-Discovery | Concurrently harvests team profiles from GitHub, Jira, Notion, and Google Calendar, reconciling identities. |
| **`cacheInvalidationWorkflow`** | `cache-invalidation-queue` | Document Mutation / Settings Rotation | Durably purges stale entries across L1 exact, L2 semantic Redis, and Tier 2 MCP tool caches. |
| **`ragIngestWorkflow`** | `rag-ingest-queue` | File Upload (`/api/v1/rag/upload`) | Durable multi-format document chunking, embedding, and HNSW vector index persistence in Python AI Service. |
| **`scheduledDeepBenchmarkWorkflow`** | `deep-benchmark-queue` | Nightly Temporal Schedule (`0 2 * * *`) | Executes multi-agent Golden dataset, DeepEval, Ragas, and EM Tau-Bench evaluation against local SLMs. |

---

## ⚡ Event-Driven Cache Invalidation (`cacheInvalidationWorkflow`)

When documents are uploaded, edited, or deleted, or when MCP credentials change:
1. The backend dispatches `cacheInvalidationWorkflow({ domain, documentFilename, all })`.
2. The `invalidateCacheActivity` executes cross-tier invalidation:
   - Purges matching exact in-memory entries in **Tier 0 L1 LRU Cache**.
   - Removes related vector embeddings and inverted indices in **Tier 1 L2 Redis Semantic Cache**.
   - Invalidates cached tool responses in **Tier 2 MCP Tool Cache**.
3. Ensures zero stale cache hits without introducing external messaging brokers or pub/sub daemons.

---

## 🌙 Scheduled Deep Multi-Agent Benchmarks (`scheduled_deep_benchmark.py`)

Located in [`services/python-ai-service/evaluation/scheduled_deep_benchmark.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/scheduled_deep_benchmark.py):
- Runs automated evaluation sweeps overnight against the local `hermes3:8b` Ollama instance.
- Measures:
  - **Multi-Agent Routing Precision & Recall**: Domain selection accuracy across all 10 domain micro-agents.
  - **1-Tool Constraint Verification**: Ensures SLM sub-agents invoke max 1 tool per step.
  - **Ragas Faithfulness & Answer Relevancy**: Grounded synthesis verification.
  - **EM Tau-Bench Trajectory Reliability**: Multi-turn dialogue state evaluation.
- Outputs structured JSON reports to `reports/evaluations/benchmark_YYYYMMDD_HHMMSS.json` and syncs trace scores to Langfuse (`langfuse_db` on port 5433).

---

## 🖥️ Temporal Web UI Explorer

Temporal's visual workflow dashboard is mounted at `http://localhost:8233` (or `http://temporal-ui:8080` internally in Docker). Operators can:
- Inspect active, running, completed, and timed-out workflow executions.
- Review activity retry counts, stack traces, and execution timelines.
- Send human signals (`approveSlackPost`, `rejectSlackPost`) directly from the Temporal UI.

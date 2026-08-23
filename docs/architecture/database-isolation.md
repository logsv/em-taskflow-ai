# Database Per-Service Isolation

EM TaskFlow AI enforces strict microservice database separation to guarantee data privacy, avoid cross-domain noise, and optimize database indexing strategies.

---

## 🗄️ Database Topology

```
┌─────────────────────────────────────────────────────────────┐
│               Primary Database Container                    │
│             (em-taskflow-postgres : Port 5432)              │
│                                                             │
│  ┌─────────────────────────┐   ┌─────────────────────────┐  │
│  │    taskflow_backend     │   │       taskflow_ai       │  │
│  │ (Sessions, Threads,     │   │ (Vector Chunks, Embeds, │  │
│  │  Messages, MCP Caches)  │   │  HNSW & GIN FTS Index)  │  │
│  └─────────────────────────┘   └─────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             temporal & temporal_visibility            │  │
│  │          (Durable Workflow State & Task Queues)       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               Analytics Database Container                  │
│           (em-taskflow-analytics-db : Port 5433)            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                      langfuse_db                      │  │
│  │      (Telemetry Traces, Spans, Token Costs, Latency)  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Detailed Database Specifications

### 1. `taskflow_backend` (Port 5432)
- **Service Owner**: Node.js Express Backend
- **Key Tables**:
  - `sessions`: Client sessions, IP, User-Agent, last active timestamps.
  - `chat_threads`: Conversational threads belonging to sessions.
  - `chat_messages`: Sequence-indexed user prompts and assistant completions.
  - `github_issues`: Cached GitHub issues and pull requests for offline fallback.
  - `dora_snapshots`: Historic DORA metrics snapshots.
  - `sprint_analytics`: Sprint capacity, velocity, and backlog items.
  - `okr_records` & `okr_tracker`: Quarterly OKRs and Key Results progress.
  - `sbi_feedback_records`: Situation-Behavior-Impact feedback dossiers.
  - `team_members`: Synchronized engineer profiles across GitHub, Jira, and Google Calendar.
  - `app_settings`: Dynamic MCP configuration overrides.

### 2. `taskflow_ai` (Port 5432)
- **Service Owner**: Python AI RAG Microservice
- **Key Tables**:
  - `pdf_chunks`: Extracted text, `parent_content` context windows, metadata JSONB, and 768-dimensional embeddings.
- **Indexes**:
  - `idx_pdf_chunks_embedding`: HNSW vector index using `vector_cosine_ops`.
  - `idx_pdf_chunks_fts`: GIN full-text search index using `pg_trgm`.

### 3. `temporal` & `temporal_visibility` (Port 5432)
- **Service Owner**: Temporal Workflow Engine
- **Purpose**: Durable workflow state, activity queues, retry schedules, and execution histories for background RAG document ingestion.

### 4. `langfuse_db` (Port 5433 / `analytics-db`)
- **Service Owner**: Self-Hosted Langfuse Telemetry
- **Purpose**: Multi-agent trace trees, latency measurements, token count breakdowns, and user feedback ratings.
- **Rule**: Backend and Python agents never write analytical trace data directly into application databases.

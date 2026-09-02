# Database Per-Service Isolation (ADR-008)

EM TaskFlow AI enforces strict **Database Per-Service Isolation** across 4 PostgreSQL database instances and isolated telemetry containers to prevent cross-domain pollution and ensure zero-downtime operations.

---

## 🗄️ Database Topology

```mermaid
graph TD
    subgraph AppHost ["Node.js Express Application (Port 4000)"]
        BackendApp["TaskFlow Backend API"]
    end

    subgraph PythonHost ["Python AI Service (Port 8000 / gRPC 50051)"]
        PythonApp["Python RAG & Evaluation Engine"]
    end

    subgraph TemporalHost ["Temporal Server (Port 7233 / UI 8233)"]
        TemporalApp["Temporal Workflow Engine"]
    end

    subgraph LangfuseHost ["Langfuse Container (Port 3001)"]
        LangfuseApp["Langfuse Observability Server"]
    end

    BackendApp -->|App State & Fallbacks| DB1[("🐘 taskflow_backend<br/>Port 5432")]
    PythonApp -->|Vector Chunks & HNSW| DB2[("🤖 taskflow_ai<br/>Port 5432")]
    TemporalApp -->|Workflows & Queues| DB3[("⏳ temporal & temporal_visibility<br/>Port 5432")]
    LangfuseApp -->|Traces & Evals| DB4[("📊 langfuse_db<br/>Port 5433 (analytics-db)")]
```

---

## 🔒 Key & Credential Preservation Rules (STRICT)

1. **`app_settings` Immunity**:
   - `app_settings` in `taskflow_backend` houses live user API keys (`JIRA_API_TOKEN`, `GITHUB_TOKEN`, `NOTION_API_KEY`, `GOOGLE_CALENDAR_API_KEY`, `SLACK_BOT_TOKEN`) and Ollama model configs.
   - It is strictly forbidden to drop, truncate, or wipe `app_settings` during database cleanup, migration, or runtime resets.
2. **Real User Profile Immunity**:
   - Real user profiles (`logsv`, admin emails, lead engineering managers) in `team_members` are never deleted during test fixture cleanups or mock resets.
3. **Secret Masking**:
   - When updating settings via UI or API, existing masked secret fields (`******`) in PostgreSQL are always retained and never replaced with empty strings.

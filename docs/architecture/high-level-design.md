# High-Level Design & 8-Stage Workflow

EM TaskFlow AI utilizes an **8-stage hybrid multi-agent pipeline** optimized for local Small Language Models (SLMs). This architecture balances low latency, accurate tool dispatching, token compression, and database resiliency.

---

## 🏛️ System Architecture Diagram

```mermaid
flowchart TD
    classDef primary fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef fast fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#f8fafc;
    classDef core fill:#312e81,stroke:#818cf8,stroke-width:1.5px,color:#f8fafc;
    classDef agent fill:#1e1b4b,stroke:#a5b4fc,stroke-width:1px,color:#f8fafc;
    classDef storage fill:#0f172a,stroke:#64748b,stroke-width:1px,color:#94a3b8;

    User(["👤 User Query & Context"]):::primary --> ExactCache{"⚡ Tier 0: L1 In-Memory Cache<br/>(<2ms)"}:::fast
    
    ExactCache -->|"Exact Hit"| FastResp0["🚀 Sub-millisecond Instant Response"]:::fast
    ExactCache -->|"Miss"| SemanticCache{"⚡ Tier 1: L2 Redis Semantic Cache<br/>(Dual-Gate Anti-Hallucination)"}:::fast
    
    SemanticCache -->|"Semantic Hit (<30ms)"| FastResp1["⚡ Semantic Cache Response"]:::fast
    SemanticCache -->|"Miss / Gate 2 Mismatch"| FastPath{"⚡ Fast-Path Pre-Classifier<br/>(<300ms SLA)"}:::primary

    FastPath -->|"Chat / Code / Math"| DirectLLM["🤖 Local Ollama SLM (hermes3:8b)"]:::fast
    FastPath -->|"Tool / RAG Intent"| Router["🧩 LLM Router & Fallback Parser"]:::primary

    Router -->|"Document Search Intent"| RAGService["🐍 Python AI RAG Engine<br/>(gRPC + HyDE + RRF Hybrid Search)"]:::core
    Router -->|"Management & Workflow Intent"| Supervisor["👑 LangGraph Multi-Agent Supervisor"]:::core

    RAGService --> Synthesizer["📄 Single-Pass RAG Synthesizer"]:::core

    subgraph AgentsGroup ["🤖 10 Specialized Domain Micro-Agents (1-Tool Constraint)"]
        direction TB
        subgraph OpsCluster ["🚀 Delivery & Engineering Operations"]
            direction LR
            DORA["📊 DORA Metrics"]:::agent
            Delivery["⚡ Delivery Bottlenecks"]:::agent
            Sprint["🏃 Sprint Capacity"]:::agent
            Roadmap["🗺️ Roadmap Alignment"]:::agent
        end
        subgraph PeopleCluster ["👥 People, Growth & Governance"]
            direction LR
            SBI["💬 SBI Feedback"]:::agent
            People["🌱 Career & 1-on-1s"]:::agent
            OKR["🎯 OKR Pacing"]:::agent
            SOP["📜 SOP & ADRs"]:::agent
        end
        subgraph AuditCluster ["🕵️ Retrospectives & Dossier Audits"]
            direction LR
            Retro["🔄 Sprint Retro (HITL)"]:::agent
            Critic["🔍 Report Critic"]:::agent
        end
    end

    Supervisor --> OpsCluster
    Supervisor --> PeopleCluster
    Supervisor --> AuditCluster

    Synthesizer --> Formatter["✨ Single-Pass Response Formatter & Non-Blocking Tracing"]:::core
    OpsCluster --> Formatter
    PeopleCluster --> Formatter
    AuditCluster --> Formatter

    DirectLLM --> UICockpit["💻 React Chat Cockpit, Action Hub & Admin Portal"]:::primary
    FastResp0 --> UICockpit
    FastResp1 --> UICockpit
    Formatter --> UICockpit

    subgraph DBCluster ["🗄️ Isolated Database-Per-Service Topology"]
        direction LR
        DB_Backend[("🐘 taskflow_backend<br/>Port 5432")]:::storage
        DB_AI[("🤖 taskflow_ai (HNSW)<br/>Port 5432")]:::storage
        DB_Temporal[("⏳ temporal<br/>Port 5432")]:::storage
        DB_Langfuse[("📊 langfuse_db<br/>Port 5433")]:::storage
    end
```

---

## 🧭 The 8-Stage Execution Lifecycle

1. **Pre-LLM Preprocessing & Compression Stage**:
   - Compresses large file uploads ($>15\text{k}$ characters) via LangChain Map-Reduce.
   - Preserves 8 recent chat turns verbatim and state-anchors earlier turns into a compact Session Fact Matrix block.
2. **5-Tier Production Caching Suite**:
   - **Tier 0 L1 Exact Cache**: Normalized in-memory LRU cache ($<2\text{ms}$).
   - **Tier 1 L2 Semantic Redis Cache**: Dual-Gate verification (Gate 1 cosine $\ge 0.95$ + Gate 2 Strict Anti-Hallucination Entity Alignment filter) in $<30\text{ms}$.
   - **Tier 2 MCP Tool Cache**: Hash-keyed cache for read-only JQL, PRs, and pages.
3. **Fast-Path Classifier (<300ms)**:
   - High-priority pre-classifier intercepting pure math, coding scripts, conversational greetings, and direct attachment questions without routing overhead.
4. **LLM Router & Resilient JSON Fallback Parser**:
   - Analyzes domain intent across `VALID_DOMAINS`. Employs `parseStructuredDecision` to extract clean JSON even when the SLM injects markdown blocks.
5. **Single-Pass RAG Engine & Python AI Service Delegation**:
   - 100% of RAG operations execute in Python via gRPC (`ai_service_grpc.py`). Executes HyDE query transformation and Reciprocal Rank Fusion (RRF) against `taskflow_ai`. Formatter bypass skips secondary LLM formatting.
6. **LangGraph Multi-Agent Supervisor**:
   - Dispatches requests across 10 specialized domain micro-agents with bounded 1-tool execution.
7. **Multi-Source MCP Integrations & DB Fallback**:
   - Gathers live data from Jira, Notion, GitHub, Slack, and Google Calendar. Falls back to PostgreSQL cached snapshots if live endpoints are offline. Direct URL resolution eliminates fake domains.
8. **Single-Pass Structured Response Formatter & Non-Blocking Telemetry**:
   - Formats structured Markdown with executive summaries, GFM tables, and citations. Emits non-blocking telemetry traces to `langfuse_db` (port 5433).

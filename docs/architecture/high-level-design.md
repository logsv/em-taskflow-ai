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

    User(["👤 User Query & Context"]):::primary --> RedisCache{"⚡ Redis Semantic Cache<br/>(Sim >= 0.95)"}:::fast
    
    RedisCache -->|"Cache Hit (<50ms)"| FastResp["🚀 Instant Response"]:::fast
    RedisCache -->|"Cache Miss"| FastPath{"⚡ Fast-Path Pre-Classifier<br/>(<300ms SLA)"}:::primary

    FastPath -->|"Chat / Code / Math"| DirectLLM["🤖 Local Ollama SLM (hermes3:8b)"]:::fast
    FastPath -->|"Tool / RAG Intent"| Router["🧩 LLM Router & Fallback Parser"]:::primary

    Router -->|"Document Search Intent"| RAGService["🐍 Python AI RAG Engine<br/>(HyDE + RRF Hybrid Search)"]:::core
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
            Retro["🔄 Sprint Retro"]:::agent
            Critic["🔍 Report Critic"]:::agent
        end
    end

    Supervisor --> OpsCluster
    Supervisor --> PeopleCluster
    Supervisor --> AuditCluster

    Synthesizer --> Formatter["✨ Single-Pass Response Formatter & Telemetry Tracing"]:::core
    OpsCluster --> Formatter
    PeopleCluster --> Formatter
    AuditCluster --> Formatter

    DirectLLM --> UICockpit["💻 React Chat Cockpit & Admin Portal"]:::primary
    FastResp --> UICockpit
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
   - Preserves 8 recent chat turns verbatim and state-anchors earlier turns.
2. **Redis Semantic Cache Check**:
   - Queries Redis vector similarity. If cosine similarity $\ge 0.95$, returns pre-computed responses in $<50\text{ms}$.
3. **Fast-Path Classifier (<300ms)**:
   - High-priority regex matcher intercepting pure math, coding scripts, conversational greetings, and direct attachment questions without routing overhead.
4. **LLM Router & Resilient JSON Parser**:
   - Analyzes intent across active domains. Employs `parseStructuredDecision` to extract clean JSON even when the SLM injects markdown blocks.
5. **Single-Pass RAG Engine**:
   - Executes HyDE query transformation and Reciprocal Rank Fusion (RRF) against `taskflow_ai`.
6. **LangGraph Multi-Agent Supervisor**:
   - Dispatches requests across 10 specialized domain micro-agents with bounded 1-tool execution.
7. **Multi-Source MCP Integrations & DB Fallback**:
   - Gathers live data from Jira, Notion, GitHub, Slack, and Google Calendar. Falls back to PostgreSQL cached snapshots if live endpoints are offline.
8. **Single-Pass Structured Response Formatter & Telemetry**:
   - Formats structured Markdown with executive summaries, GFM tables, and citations. Emits non-blocking telemetry traces to `langfuse_db` (port 5433).

# High-Level Design & 8-Stage Workflow

EM TaskFlow AI utilizes an **8-stage hybrid multi-agent pipeline** optimized for local Small Language Models (SLMs). This architecture balances low latency, accurate tool dispatching, token compression, and database resiliency.

---

## 🏛️ System Architecture Diagram

```mermaid
flowchart TD
    User([👤 User Query]) --> RedisCache{⚡ Redis Semantic Cache\nCosine Sim >= 0.95}
    
    RedisCache -- "Cache Hit" --> CachedResp[🚀 Instant Response\n<50ms]
    RedisCache -- "Cache Miss" --> FastPath{⚡ Fast-Path Classifier\n<300ms}
    
    FastPath -- "Direct Query (Math/Code/Chat/Attachment)" --> DirectLLM[🤖 Local Ollama Inference\nhermes3:8b]
    FastPath -- "Complex / Tool / RAG Intent" --> Router[🧩 LLM Router\nDomain & Intent Classifier]
    
    Router -- "RAG Search Intent" --> PythonAI[🐍 Python AI RAG Service\nHyDE + RRF Hybrid Search]
    PythonAI --> SinglePass[📄 Single-Pass RAG Synthesizer]
    
    Router -- "Multi-Domain Intent" --> Supervisor[👑 LangGraph Supervisor]
    
    Supervisor --> DORA[📊 DORA Micro-Agent\nGitHub + Jira + DB Fallback]
    Supervisor --> Delivery[🚀 Delivery Micro-Agent\nJira Blockers + PR Cycle Time]
    Supervisor --> SBI[💬 SBI Micro-Agent\n1-on-1s + Jira + Slack]
    Supervisor --> People[👥 People Micro-Agent\nCalendar 1-on-1s + Notion Ladders]
    Supervisor --> Sprint[⚡ Sprint Micro-Agent\nJira Backlog + Calendar PTOs]
    Supervisor --> Retro[🔄 Retro Micro-Agent\nThematic: Notion + Jira + Slack + GitHub]
    Supervisor --> Roadmap[🗺️ Roadmap Micro-Agent\nJira Epics + GitHub Milestones]
    Supervisor --> OKR[🎯 OKR Micro-Agent\nNotion OKRs + Jira + Commits]
    Supervisor --> SOP[📜 SOP Micro-Agent\nNotion Policies + ADR Governance]
    Supervisor --> Critic[🕵️ Critic Micro-Agent\nDraft EM Report Audit]
    
    SinglePass --> Formatter[✨ Response Formatter]
    DORA --> Formatter
    Delivery --> Formatter
    SBI --> Formatter
    People --> Formatter
    Sprint --> Formatter
    Retro --> Formatter
    Roadmap --> Formatter
    OKR --> Formatter
    SOP --> Formatter
    Critic --> Formatter
    
    DirectLLM --> UICockpit
    CachedResp --> UICockpit
    Formatter --> UICockpit[💻 React Cockpit / Standalone Admin Portal]
    
    subgraph Data & Telemetry Services (Isolated DBs)
        BackendDB[(🗄️ taskflow_backend\nPort 5432)]
        AIDB[(🤖 taskflow_ai\nPort 5432)]
        TemporalDB[(⏳ temporal\nPort 5432)]
        Redis[(⚡ Redis Cache\nPort 6379)]
        Langfuse[(📊 langfuse_db\nPort 5433)]
    end
    
    PythonAI -. RRF Search .-> AIDB
    Supervisor -. Session & DB Fallbacks .-> BackendDB
    PythonAI -. Cache Set .-> Redis
    Formatter -. Non-Blocking Tracing .-> Langfuse
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

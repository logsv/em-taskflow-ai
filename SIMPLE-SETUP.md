# EM TaskFlow - Simple Setup

## Quick Start

### Prerequisites
- **Python**: Ensure Python 3.8+ and pip are available
- **Node.js**: v20.15.0 or later
- **curl**: For health checks (usually pre-installed)

### Start All Services
```bash
./start.sh
```

**The script automatically:**
- 🦙 **Manages Ollama**: Stops/starts Ollama cleanly
- 📥 **Downloads Models**: Pulls llama3.2:latest and nomic-embed-text if needed
- 🔨 **Builds Backend**: Compiles TypeScript automatically
- 🐍 **Starts Python BGE**: Embeddings & reranker services
- 🔧 **Starts Backend**: Node.js API server (port 4000)
- ⚛️ **Starts Frontend**: React app (port 3000)

### Environment Variables (Optional)
```bash
export NOTION_API_KEY="your_notion_api_key"
export MCP_NOTION_ENABLED="true"
export MCP_JIRA_ENABLED="true"
export LLM_DEFAULT_MODEL="llama3.2:latest"
```

**Note**: The script uses built-in defaults for Notion/Jira if not set.

### Stop All Services
```bash
./stop.sh
```

### Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://127.0.0.1:4000/api/health
- **BGE Embeddings**: http://localhost:8001/health
- **BGE Reranker**: http://localhost:8002/health

### Service Logs

- **Backend**: `tail -f backend.log`
- **Frontend**: `tail -f frontend.log`

### Features Enabled

- ✅ **Notion Integration** (19 tools)
- ✅ **Jira/Confluence** (25 tools) 
- ✅ **RAG with ChromaDB** (document search)
- ✅ **Llama 3.2** (fast LLM responses)
- ✅ **Transformers.js embeddings and reranking** (Node-only, no Python required)
- ✅ **Agent System** (44 total tools)

### Troubleshooting

1. **Ollama not running**: `ollama serve`
2. **Port conflicts**: Check if ports 3000/4000 are free
3. **Build fails**: `cd backend && npm install && npm run build`

### System Design Overview

The core system is built around a LangGraph **supervisor multi-agent** that uses MCP tools, RAG, and an LLM:

```mermaid
graph TD
    U[User] --> UI[Web UI]
    UI --> API[Backend API]

    API --> AG[LangGraphAgentService]
    AG --> S[Supervisor Agent]

    S --> AJ[Jira Agent]
    S --> AGH[GitHub Agent]
    S --> AN[Notion Agent]

    AJ --> MCP[MCP Adapter\nReliableMCPClient]
    AGH --> MCP
    AN --> MCP

    MCP --> J[Jira MCP Server]
    MCP --> N[Notion MCP Server]
    MCP --> G[Google MCP Server]

    AG --> RAG[RAG Service]
    RAG --> V[ChromaDB]

    AG --> LLM[LLM (ChatOllama)]
    LLM --> UI
```

At a glance:
- The **LangGraphAgentService** exposes the supervisor graph to the API.
- The **Supervisor Agent** routes work to Jira/GitHub/Notion specialist agents.
- Specialist agents call tools through the **MCP adapter** and `ReliableMCPClient`.
- The **RAG Service** enriches queries with context from ChromaDB when available.
- The shared **LLM (ChatOllama)** generates the final response using MCP and RAG context.

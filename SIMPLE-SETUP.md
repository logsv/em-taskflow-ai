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
- **Python**: Check terminal where start.sh was run

### Features Enabled

- ✅ **Notion Integration** (19 tools)
- ✅ **Jira/Confluence** (25 tools) 
- ✅ **RAG with ChromaDB** (document search)
- ✅ **Llama 3.2** (fast LLM responses)
- ✅ **Python BGE** (embeddings & reranking)
- ✅ **Agent System** (44 total tools)

### Troubleshooting

1. **Ollama not running**: `ollama serve`
2. **Port conflicts**: Check if ports 3000/4000/8001/8002 are free
3. **Build fails**: `cd backend && npm install && npm run build`
4. **Python services fail**: `cd python-services && pip install -r embeddings/requirements.txt`

### File Structure

- `start.sh` - Start all services
- `stop.sh` - Stop all services  
- `backend/` - Node.js TypeScript API server
- `frontend/` - React application
- `python-services/` - BGE embeddings & reranker

### Configuration

Main configuration is in `backend/src/config.ts` with environment variable overrides.

No complex shell scripts or configuration files needed! 🎉
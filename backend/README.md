# EM-TaskFlow Backend

A production-ready Node.js backend service powering the EM TaskFlow platform. It combines **Retrieval-Augmented Generation (RAG)**, **LangChain-native Model Context Protocol (MCP)** integrations, and **intelligent LLM routing** to provide a comprehensive task management and knowledge assistant.

## 🏗️ Technical Architecture

### 🔗 Reliable MCP Integration
The MCP system uses `@langchain/mcp-adapters` for production reliability:
- **Automatic Reconnection**: Exponential backoff with configurable retry limits
- **Health Monitoring**: Real-time server status and tool availability
- **Multi-Server Orchestration**: Unified interface for multiple MCP servers (Notion, Jira, Google Calendar)
- **LangGraph Integration**: Native Tool objects for seamless agent usage

### 🧠 Supervisor Multi-Agent System
Defined in [`src/agent/graph.js`](./src/agent/graph.js), the system uses a **LangGraph-based supervisor**:
- **Supervisor Agent**: Routes user queries to specialist agents
- **Specialist Agents**:
  - **Jira Agent**: Task management and tracking
  - **GitHub Agent**: Code repository operations
  - **Notion Agent**: Knowledge base management
- **Shared Resources**: All agents share LLM clients and MCP tools

### 📚 RAG System Architecture
- **Document Processing**: Intelligent PDF parsing with semantic chunking (~1000 chars)
- **Vector Search**: Semantic search using Ollama `nomic-embed-text` embeddings and ChromaDB
- **Context Integration**: Seamlessly combines document context with LLM responses

### 🛡️ Type-Safe Configuration
- **Zod Validation**: Runtime validation of environment variables and config files
- **Single Source**: `src/config.js` manages all configuration with strict typing

## 🚀 Services Overview

- **Agent Service**: Orchestrates intent analysis, data fetching, and response generation.
- **LLM Service**: Ollama-first client with support for OpenAI/Anthropic/Gemini via `llm-router`.
- **RAG Service**: Manages document ingestion and vector retrieval.
- **MCP Service**: Handles connections to external tools via Model Context Protocol.
- **Database Service**: SQLite-backed persistence for chat history.

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 20.x (see `.nvmrc`)
- Python 3.8+ (for ChromaDB)
- Ollama (running locally)

### Installation
```bash
cd backend
pnpm install
```

### Configuration
1. Copy the example config:
   ```bash
   cp src/config/local.example.json src/config/local.json
   ```
2. Configure environment variables (optional overrides):
   ```bash
   export NOTION_API_KEY=your_key
   export OPENAI_API_KEY=your_key
   ```

### Running the Server
```bash
# Development mode with hot-reload
npm run dev

# Production build and start
npm run build
npm start
```

## 🧪 Testing
The project uses **Jasmine** for testing and **NYC** for coverage.

```bash
# Run all tests
npm test

# Run specific test
npx jasmine dist/test/services/agentService.spec.js
```

## 📊 API Endpoints
- `POST /api/chat`: Main chat endpoint (Agent + RAG)
- `GET /api/health`: System health status
- `GET /api/mcp-status`: MCP tool availability
- `POST /api/rag/ingest`: Upload and process documents

## 📄 License
ISC License

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EM TaskFlow is an AI-powered productivity platform that combines Retrieval-Augmented Generation (RAG), Model Context Protocol (MCP) integrations, and intelligent LLM routing. The system processes PDF documents, integrates with external services (Notion, Jira, Google Calendar), and uses sophisticated AI agents to provide contextual responses.

## Architecture

This is a full-stack TypeScript application with:

- **Backend**: Node.js with TypeScript using ES modules (`"type": "module"`)
- **Frontend**: React application with service worker support
- **Vector Database**: ChromaDB for document embeddings and semantic search
- **LLM Provider**: Ollama for local LLM and embedding models (mistral:latest, nomic-embed-text)
- **External Integrations**: MCP servers for Notion, Jira, Google Calendar via Model Context Protocol

### Key Services

- **Agent Service**: Orchestrates intent analysis, data fetching, and response generation
- **Enhanced LLM Router**: Production-ready router using the [llm-router](https://www.npmjs.com/package/llm-router) npm package with resilience patterns, metrics tracking, and multi-provider support
- **RAG Service**: Processes PDFs and performs semantic search using vector embeddings
- **MCP Service**: Connects to external tools via Model Context Protocol
- **Database Service**: SQLite3 for chat history and metadata

## Development Commands

### Backend (from /backend directory)
```bash
# Build TypeScript
npm run build

# Start production server
npm start

# Development with auto-reload
npm run dev

# Run tests with coverage (requires building first)
npm test

# Start MCP servers
npm run start:mcp
npm run start:google
npm run start:atlassian
```

### Frontend (from /frontend directory)
```bash
# Start development server (port 3000)
npm start

# Build for production
npm build

# Run tests
npm test
```

### Full System Management (from project root)
```bash
# Start all services (Chroma, Ollama, Backend, Frontend)
./start.sh

# Or use the full management script
./manage-services.sh start
./manage-services.sh stop
./manage-services.sh restart
./manage-services.sh status

# Individual services
./manage-services.sh ollama
./manage-services.sh chroma
./manage-services.sh backend
./manage-services.sh frontend
```

## Service Dependencies

1. **ChromaDB** (port 8000): Vector database - must start first
2. **Ollama** (port 11434): Local LLM service with models mistral:latest and nomic-embed-text
3. **Backend** (port 4000): Main API server
4. **Frontend** (port 3000): React UI with proxy to backend

## Testing

- **Test Framework**: Jasmine with Sinon for mocking
- **Coverage**: NYC (Istanbul) with minimum thresholds: 42% statements, 29% branches, 36% functions
- **Test Structure**: Located in `backend/test/` with service, route, and utility tests
- **CI/CD**: GitHub Actions workflow for automated testing

## Configuration Files

- `backend/config/llm-router.yaml`: LLM provider configuration
- `backend/config/llm-config.yaml`: Model settings
- `backend/tsconfig.json`: TypeScript compilation for source
- `backend/tsconfig.test.json`: TypeScript compilation for tests
- `backend/jasmine.json`: Test runner configuration

## Important Patterns

- **ES Modules**: All backend code uses ES module imports/exports
- **Type Safety**: Strict TypeScript configuration
- **Error Handling**: Comprehensive error handling with graceful fallbacks
- **Service Pattern**: Business logic separated into service classes
- **Repository Pattern**: Data access abstraction
- **Circuit Breaker Pattern**: Resilient external service integration

## Working with the Codebase

When making changes:

1. **Backend changes**: Always run `npm run build` before starting
2. **Testing**: Use `npm test` for comprehensive testing with coverage
3. **Dependencies**: The project uses both npm and pnpm - check package.json scripts for the correct package manager
4. **Service Integration**: When working with RAG/MCP services, ensure external dependencies (Chroma, Ollama) are running
5. **Environment Variables**: Check for required API keys for external services (Notion, Jira, Google)
6. **LLM Router Testing**: Use the API endpoints to test the enhanced router:
   - `GET /api/llm-status` - Check provider status and metrics
   - `POST /api/llm-test` - Test completions with different providers and parameters
   - `GET /api/health` - Overall system health including LLM router status

## Common Development Tasks

- **Adding new LLM providers**: Add handlers to `backend/src/services/newLlmRouter.ts` and update configuration in `backend/config/llm-router.yaml`
- **LLM Router Configuration**: Modify `backend/config/llm-router.yaml` for provider settings, circuit breakers, and retry policies
- **New MCP servers**: Add to `backend/src/services/mcpService.ts` configuration
- **RAG enhancements**: Work with `backend/src/services/ragService.ts` for document processing
- **Frontend components**: Located in `frontend/src/components/`

## File Structure Notes

- Backend source: `backend/src/`
- Frontend source: `frontend/src/`
- Compiled backend: `backend/dist/`
- Test files: `backend/test/`
- MCP servers: `mcp-servers/` (separate workspace packages)
- Data storage: `backend/data/` for SQLite and PDFs
- Vector database: `chroma/` directory
# EM-TaskFlow Backend

A Node.js backend service with integrated RAG (Retrieval-Augmented Generation), MCP (Model Context Protocol), LangGraph supervisor multi-agent orchestration, and LLM capabilities.

## 🚀 Features

- **Node.js** backend with ES modules
- **RAG Service** for document processing and vector search
- **MCP Adapter Integration** for external tools (Notion, Jira, Google Calendar) via MCP
- **LangGraph Supervisor Multi-Agent** system coordinating Jira/GitHub/Notion specialists
- **LLM Clients** with Ollama-first support and optional external providers
- **Agent Service** for intelligent query processing over MCP tools and RAG
- **Comprehensive Testing** with Jasmine and Sinon
- **Code Coverage** with NYC (Istanbul)
- **CI/CD Pipeline** with GitHub Actions

## 📋 Prerequisites

- Node.js 18.x or 20.x
- npm or yarn
- TypeScript 5.x

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests with coverage
npm test

# Run tests without coverage
npm run test:no-coverage

# Run specific test file
npx jasmine dist/test/services/agentService.spec.js

# Run tests with specific pattern
npx jasmine dist/test/**/*Service.spec.js
```

### Test Structure

```
backend/test/
├── services/           # Service layer tests
│   ├── agentService.spec.ts
│   ├── llmService.spec.ts
│   ├── ragService.spec.ts
│   └── databaseService.integration.spec.ts
├── routes/            # API route tests
│   └── api.spec.ts
├── utils/             # Utility function tests
│   ├── math.spec.ts
│   ├── validation.spec.ts
│   └── logger.spec.ts
├── setup.ts           # Test setup and configuration
└── types.d.ts         # Test type definitions
```

### Coverage Reports

- **Current Coverage**: ~42% statements, ~37% functions, ~30% branches
- **Target Coverage**: 45% (configurable in package.json)
- **Reports**: Generated in `coverage/` directory
- **Formats**: HTML, LCOV, JSON, Text

### Test Configuration

#### NYC (Istanbul) Configuration
```json
{
  "nyc": {
    "all": true,
    "include": ["dist/src/**/*.js"],
    "exclude": ["dist/test/**/*.js", "node_modules/**"],
    "reporter": ["html", "text", "lcov", "json-summary"],
    "check-coverage": true,
    "branches": 29,
    "lines": 42,
    "functions": 36,
    "statements": 42
  }
}
```

#### Jasmine Configuration
```json
{
  "spec_dir": "dist/test",
  "spec_files": ["**/*.spec.js"],
  "helpers": ["setup.js"],
  "random": true,
  "seed": null,
  "stopSpecOnExpectationFailure": false
}
```

## 🔧 Development

### Scripts

```bash
# Development with auto-reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run linting
npx eslint src --ext .ts

# Type checking
npx tsc --noEmit
```

### Project Structure

```
backend/
├── src/
│   ├── services/      # Business logic services
│   ├── routes/        # Express route handlers
│   ├── utils/         # Utility functions
│   ├── types/         # TypeScript type definitions
│   └── config/        # Configuration files
├── test/              # Test files
├── dist/              # Compiled JavaScript
└── coverage/          # Coverage reports
```

## 🚦 CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline includes:

1. **Testing Job**
   - Matrix testing on Node.js 18.x and 20.x
   - TypeScript compilation
   - Test execution with coverage
   - Coverage reporting

2. **Frontend Job** (conditional)
   - Frontend build and test (if frontend exists)
   - Skips gracefully if no frontend

3. **Integration Testing**
   - PostgreSQL service setup
   - Database integration tests
   - Environment-specific testing

4. **Security Scanning**
   - npm audit for vulnerabilities
   - Dependency security checks

5. **Deployment** (main branch only)
   - Production build
   - Deployment notifications

### Workflow Triggers

- **Push** to `main` or `develop` branches
- **Pull Requests** to `main` branch

### Environment Variables

```bash
# Testing
NODE_ENV=test
DATABASE_URL=postgres://user:pass@localhost:5432/testdb

# Coverage
NODE_OPTIONS='--loader @istanbuljs/esm-loader-hook'
```

## � Supervisor Multi-Agent Architecture

The backend uses a LangGraph-based supervisor multi-agent system defined in [`src/agent/graph.js`](./src/agent/graph.js):

- A **supervisor agent** receives user queries and routes work between:
  - A Jira-focused agent
  - A GitHub-focused agent
  - A Notion-focused agent
- Each specialist agent:
  - Uses MCP tools provided by the MCP adapter (`src/mcp/index.js`, `src/mcp/client.js`)
  - Runs on top of a shared LLM client from `src/llm/index.js` (ChatOllama)
- The supervisor:
  - Coordinates tool usage across agents
  - Produces a single, coherent response for the user
  - Is accessed through the `LangGraphAgentService` in [`src/agent/service.js`](./src/agent/service.js)

High-level flows:

- `/api/llm-summary` and `/api/rag-query` call the supervisor via `LangGraphAgentService`
- RAG context is injected where available, and MCP tools are used from within the agents
- Direct LLM calls (e.g., for RAG fallbacks) use the Ollama-based client in `src/llm/index.js`

## 🧩 Services Overview

### Agent Service
- Supervisor multi-agent built with LangGraph
- Orchestrates Jira, GitHub, and Notion agents over MCP tools
- Integrates RAG context into queries when available
- Central entrypoint for `/api/llm-summary`, `/api/rag-query`, and LLM health/status endpoints

### LLM Service
- Ollama-based Chat and embeddings client (`src/llm/index.js`)
- Optional multi-provider configuration via `src/config.js`
- Used by the supervisor and RAG fallbacks for text generation
- No separate LLM router component; calls go directly through the LLM client

### RAG Service
- Document processing (PDF, text) and ingestion
- Vector database integration (Chroma)
- Semantic search over stored chunks
- Used by the agent and RAG-specific endpoints

### MCP Service
- MCP adapter and `ReliableMCPClient` manage external MCP servers
- Provides MCP tools (Jira, Notion, Google, etc.) to LangGraph agents
- Tool discovery and grouping (e.g., Jira/GitHub/Notion tool sets)
- No separate MCP REST routes; MCP is accessed from inside the agent graph

### Database Service
- SQLite-backed persistence for chat history and metadata
- Query execution and basic transaction handling

## 🔄 Recent Architecture Changes

- **Supervisor Multi-Agent**:
  - Introduced a LangGraph-based supervisor with Jira/GitHub/Notion specialist agents
  - Centralized agent entry in `src/agent/service.js` and `src/agent/graph.js`
- **MCP Integration**:
  - MCP connectivity is handled via the MCP adapter in `src/mcp/index.js` and `src/mcp/client.js`
  - Legacy `mcpService` and dedicated MCP HTTP routes have been removed
- **LLM Routing**:
  - Removed the legacy LLM router (`src/llm/router.js`) and `newLlmRouter` service
  - All generation now goes through the shared LLM client from `src/llm/index.js`
- **Task Management and Summary Helpers**:
  - Removed `taskManager` and `summaryFormatter` services and their API routes/tests
  - Task completion and summaries are now expected to be handled through MCP tools invoked by the agents

## 🔍 Testing Best Practices

### Mocking Strategy
- **Sinon sandboxes** for isolated test environments
- **External service mocking** (LLM, database, MCP)
- **Proper cleanup** in afterEach hooks
- **Realistic test data** and scenarios

### Test Categories
- **Unit Tests**: Individual function/method testing
- **Integration Tests**: Service interaction testing
- **API Tests**: Route and middleware testing
- **Utility Tests**: Helper function validation

### Coverage Goals
- **Statements**: 42%+ (target: 45%)
- **Functions**: 36%+ (target: 45%)
- **Branches**: 29%+ (target: 42%)
- **Lines**: 42%+ (target: 45%)

## 📊 Monitoring & Reporting

### Coverage Reports
- **HTML Report**: `coverage/index.html`
- **LCOV Report**: `coverage/lcov.info`
- **JSON Summary**: `coverage/coverage-summary.json`

### Test Results
- **Console Output**: Real-time test results
- **JUnit XML**: CI/CD integration
- **Coverage Badges**: Repository status

## 🚨 Troubleshooting

### Common Issues

1. **ESM Module Loading**
   ```bash
   # Use NODE_OPTIONS for ES module support
   NODE_OPTIONS='--loader @istanbuljs/esm-loader-hook' npm test
   ```

2. **TypeScript Compilation**
   ```bash
   # Ensure both main and test configs compile
   npx tsc && npx tsc -p tsconfig.test.json
   ```

3. **Coverage Not Working**
   ```bash
   # Check NYC configuration and file paths
   npx nyc --help
   ```

4. **Test Failures**
   ```bash
   # Run specific test for debugging
   npx jasmine dist/test/services/specific.spec.js
   ```

## 📝 Contributing

1. **Write Tests**: All new features require tests
2. **Maintain Coverage**: Keep coverage above thresholds
3. **Follow Patterns**: Use existing test patterns
4. **Update Documentation**: Keep README current

## 📄 License

ISC License - see LICENSE file for details.

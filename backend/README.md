# EM-TaskFlow Backend

A comprehensive Node.js/TypeScript backend service with integrated RAG (Retrieval-Augmented Generation), MCP (Model Context Protocol), and LLM capabilities.

## 🚀 Features

- **TypeScript/Node.js** backend with ES modules
- **RAG Service** for document processing and vector search
- **MCP Integration** for external tool connectivity (Notion, Jira, Calendar)
- **LLM Services** with multiple provider support (Ollama, OpenAI)
- **Agent Service** for intelligent query processing
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

## 🧩 Services Overview

### Agent Service
- Intelligent query processing
- Intent analysis and routing
- RAG and MCP integration
- Error handling and fallbacks

### LLM Service
- Multiple provider support (Ollama, OpenAI)
- Request/response handling
- Error recovery and retries
- Model management

### RAG Service
- Document processing (PDF, text)
- Vector database integration
- Semantic search capabilities
- Chunk management

### MCP Service
- External tool connectivity
- Notion, Jira, Calendar integration
- Tool discovery and execution
- Connection management

### Database Service
- SQLite3 integration
- Query execution
- Transaction management
- Migration support

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
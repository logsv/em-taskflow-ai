---
name: structured-json-logging-ops
description: Operational procedures for managing, configuring, formatting, and verifying structured leveled JSON logging and non-blocking telemetry across Node.js (Pino) and Python AI Service (JSONFormatter, SafeAxiomHandler) in EM TaskFlow AI.
---

# Structured JSON Logging & Telemetry Operations Skill

Use this skill when implementing, refactoring, verifying, or debugging logging and telemetry across the Node.js API Gateway and Python AI microservice in EM TaskFlow AI.

---

## 🏛️ Architecture & Logging Standards

EM TaskFlow AI enforces **100% Structured JSON Logging** across both Node.js and Python runtimes. Raw, unformatted `console.log` / `console.warn` / `console.error` and Python `print()` statements are strictly prohibited in production code paths.

### 1. Log Level Hierarchy & Usage Matrix

| Level | Intended Use Case | Production Visibility | Examples |
| :--- | :--- | :--- | :--- |
| **`DEBUG`** | High-volume loop steps, chunk transformations, text tokenization, query reformulations, sub-batch embedding iterations. | Disabled by default (Enabled via `LOG_LEVEL=debug`). | Batch embedding slice progress, token splitter chunk sizes, regex normalization steps. |
| **`INFO`** | High-level system lifecycle events, startup milestones, successful MCP tool calls, database upsert counts, completed workflow executions. | Enabled by default (`LOG_LEVEL=info`). | Server listen ports, MCP tool execution completion with latency, team member reconciliation totals. |
| **`WARN`** | Non-fatal degradations, circuit-breaker activations, transient upstream timeouts, graceful PostgreSQL or in-memory fallback activations. | Enabled by default. | Live Jira/GitHub API rate limit fallback to DB cache, Temporal server connection retries, non-blocking Langfuse telemetry failures. |
| **`ERROR`** | Critical operation failures, unrecoverable request errors, database transaction aborts. | Enabled by default. | RAG ingestion failure, unhandled route exceptions, corrupt document uploads. |

---

## 🛡️ Anti-Hallucination & Telemetry Rules (Strict Compliance)

1. **Rule of Zero-Downtime Telemetry ([AGENTS.md](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/AGENTS.md))**:
   - Logging, trace recording (Langfuse), and observability callbacks (Axiom, Phoenix, OpenTelemetry) MUST be non-blocking.
   - Any failure in logging or remote telemetry ingestion must NEVER fail an API request or crash a server process.
2. **Rule of Zero Raw Console / Print Calls**:
   - Never use `console.log(...)` or `print(...)` in backend or Python service modules.
   - Always import and use the centralized logger modules.
3. **Rule of Structured Context Attributes**:
   - Always include contextual metadata (`module`, `action`, `durationMs`, identifiers) as structured JSON attributes rather than string-interpolating large blobs into log messages.
4. **Rule of Zero Silent Failures (Strict Enforcement)**:
   - Empty catch blocks (`catch (_e) {}` or `catch (err) {}`) that silently swallow exceptions are **strictly prohibited**.
   - If an error is expected or non-fatal (such as a timeout or fallback trigger), it must be logged at `warn` or `debug` level with structured context:
     ```javascript
     } catch (err) {
       warn({ module: 'jiraHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
     }
     ```

---

## 💻 Code Patterns & Usage Examples

### 1. Node.js Gateway Logging (`backend/src/utils/logger.js`)

#### Import Pattern:
```javascript
import { info, warn, error, debug } from '../utils/logger.js';
// or default export
import logger from '../utils/logger.js';
```

#### Standard Usage:
```javascript
// Structured info with metadata
info({ module: 'githubMcp', action: 'searchIssues', repo: 'owner/repo', count: 12 }, 'GitHub issues retrieved successfully');

// Warning on graceful fallback
warn({ module: 'jiraMcp', action: 'searchJqlFallback', jql: 'project = PROJ', err: errorObj }, 'Jira live search timed out, falling back to PostgreSQL cache');

// Error logging
error({ module: 'ragIngest', action: 'processPDF', filename: 'handbook.pdf', err: errorObj }, 'Failed to ingest PDF document');

// Debug loop logging
debug({ module: 'bgeClient', action: 'batchEmbed', batch: 2, totalBatches: 5 }, 'Processing embedding batch');
```

#### HTTP Express Request Logging:
```javascript
import { httpRequestLogger } from './utils/logger.js';

app.use(httpRequestLogger); // Emits structured request method, path, status, and duration_ms
```

---

### 2. Python AI Service Logging (`services/python-ai-service/app/telemetry/json_logger.py`)

#### Import Pattern:
```python
import logging
logger = logging.getLogger("rag_processor.database")
```

#### Standard Usage:
```python
# Structured INFO with extra details
logger.info(
    "PDF text extraction completed",
    extra={"details": {
        "module": "file_processor",
        "action": "extract_document",
        "filename": filename,
        "chars_extracted": len(text),
        "duration_ms": duration_ms
    }}
)

# Resilient WARN logging
logger.warning(
    "pgvector HNSW index unavailable, falling back to tsvector search",
    extra={"details": {
        "module": "rag_database",
        "action": "hybrid_search",
        "error": str(err)
    }}
)
```

---

## 🧪 Operational & Verification Commands

### 1. Verify Node.js Backend Tests & Zero Unformatted Logs
```bash
cd backend

# Execute Jasmine test suite (All 245 specs must pass)
npm test

# Verify absence of raw console calls in source code (excluding tests)
npx ripgrep "console\.(log|warn|error)" src/
```

### 2. Verify Python AI Service Pytests & Zero Raw Print Calls
```bash
cd services/python-ai-service

# Execute Python test suite (All 45 specs must pass)
uv run pytest

# Verify absence of raw print calls in application and evaluation code
uv run python -c "import subprocess; res = subprocess.run(['rg', 'print\(', 'app/', 'evaluation/'], capture_output=True, text=True); print('Print count:', len(res.stdout.splitlines()))"
```

### 3. Verify Log Aggregator Ingestion Output
```bash
# Check Docker container log streams in JSON format
docker compose logs -f backend | jq .
docker compose logs -f python-ai-service | jq .
```

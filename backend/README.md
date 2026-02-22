# EM TaskFlow Backend

Node.js API service for local-first RAG deployment.

Current production-style profile:
- Runtime mode: `full` or `rag_only`
- Storage: Postgres (`DATABASE_URL`)
- Vector store: Chroma
- Default LLM: Ollama (or configured provider)

## Active API Surface

- `GET /api/health`
- `GET /api/router/metrics`
- `POST /api/query`
- `GET /api/threads`
- `GET /api/threads/:threadId/messages`
- `POST /api/rag/ingest`
- `GET /api/rag/documents`
- `POST /api/rag/documents/:documentId/query`
- OAuth helpers:
  - `GET /api/mcp/notion/oauth/start`
  - `GET /api/mcp/github/oauth/start`

## Configuration

Main env file:
- `backend/.env`

Template:
- `backend/.env.example`

Important variables:
- `RUNTIME_MODE=rag_only|full`
- `ROUTER_ROLLOUT_MODE=off|shadow|enforced`
- `ROUTER_ROLLOUT_PERCENT=0..100`
- `ROUTER_LOW_CONFIDENCE_THRESHOLD=0..1`
- `DATABASE_URL=postgresql://...`
- `LLM_DEFAULT_PROVIDER=ollama|google|openai|anthropic`
- `OLLAMA_BASE_URL=...`
- `RAG_ADVANCED_ENABLED=true|false`

Success gate thresholds:
- `ROUTER_SUCCESS_DOMAIN_ACCURACY`
- `ROUTER_SUCCESS_UNWANTED_RAG_MAX`
- `ROUTER_SUCCESS_TOOL_GROUNDED_MIN`
- `ROUTER_SUCCESS_EM_USEFULNESS_MIN`

## Local Run

Use the root-level orchestrator:
```bash
./start.sh
```

Or run backend directly:
```bash
cd backend
npm install
npm start
```

## Testing

```bash
cd backend
npm test
```

If you only want route tests:
```bash
npx jasmine test/routes/api.spec.js
```

Run routing evaluation:
```bash
npm run evaluate
```

## Notes

- The backend includes request hardening middleware:
  - request ID header (`x-request-id`)
  - in-memory rate limiting
  - JSON body size limits
- For full runtime, set `RUNTIME_MODE=full` and ensure MCP/agent dependencies are configured.

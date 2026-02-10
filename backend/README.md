# EM TaskFlow Backend

Node.js API service for local-first RAG deployment.

Current production-style profile:
- Runtime mode: `rag_only`
- Storage: Postgres (`DATABASE_URL`)
- Vector store: Chroma
- Default LLM: Ollama

## Active API Surface

- `GET /api/health`
- `GET /api/llm-status`
- `POST /api/upload-pdf`
- `POST /api/rag/query`

Legacy agent/storage endpoints are intentionally removed from the default runtime path.

## Configuration

Main env file:
- `backend/.env`

Template:
- `backend/.env.example`

Important variables:
- `RUNTIME_MODE=rag_only|full`
- `DATABASE_URL=postgresql://...`
- `LLM_DEFAULT_PROVIDER=ollama|google|openai|anthropic`
- `OLLAMA_BASE_URL=...`
- `RAG_ADVANCED_ENABLED=true|false`

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

## Notes

- The backend includes request hardening middleware:
  - request ID header (`x-request-id`)
  - in-memory rate limiting
  - JSON body size limits
- For full runtime, set `RUNTIME_MODE=full` and ensure MCP/agent dependencies are configured.

# EM TaskFlow Backend

Node.js API service for local-first RAG deployment.

Current production-style profile:
- Runtime mode: `full` or `rag_only`
- Storage: Postgres (`DATABASE_URL`)
- Vector store: Chroma
- Default LLM: Ollama (or configured provider)

## Active API Surface

- `GET /api/health` - Check health status of all systems (database, agent, mcp, rag)
- `GET /api/session` - Retrieve or initialize cookies/headers session context
- `POST /api/chat` - Process user chat queries using the multi-agent supervisor/router model
- `POST /api/feedback` - Log telemetry feedback (thumbs up/down) to LangSmith
- `POST /api/rag/upload` - Ingest PDF documents into the vector store

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

## How to Run

### Via Docker (Recommended)
From the project root directory, run:
```bash
docker compose up -d --build
```

### Locally (Development Mode)
Ensure Postgres, Chroma, and LLM services are running. Then:
```bash
cd backend
npm install
npm run dev
```

## Testing

```bash
cd backend
npm test
```

If you only want specific unit tests:
```bash
npx jasmine test/application/feedbackApplicationService.spec.js
```

Run routing evaluation:
```bash
npm run evaluate
```

## Notes

- The backend includes request hardening middleware:
  - Request ID header (`x-request-id`)
  - In-memory rate limiting
  - JSON body size limits
- For full runtime, set `RUNTIME_MODE=full` and ensure MCP/agent dependencies are configured.

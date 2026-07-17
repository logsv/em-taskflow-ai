# EM TaskFlow AI

Local-first production-style deployment with Docker Compose.

Default runtime:
- `frontend`
- `backend` (`RUNTIME_MODE=rag_only`)
- `postgres`
- `chroma`

Optional runtime:
- `vllm` (GPU profile)

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- 8GB+ RAM recommended
- For vLLM profile: NVIDIA GPU + NVIDIA Container Toolkit

## Quick Start

1. Start services:
```bash
docker compose up -d --build
```

2. Open app:
- `http://localhost:3000`

3. Stop services:
```bash
docker compose down
```

## GPU Profile (Optional)

```bash
docker compose --profile gpu up -d --build
```

## Configuration

- Active local config: `backend/.env`
- Template: `backend/.env.example`
- Default provider is Google Gemini (OpenAI-compatible endpoint).
- Default runtime mode is `rag_only`.

## Smoke Tests

1. Backend health:
```bash
curl -s http://localhost:4000/api/health
```

2. Upload PDF:
```bash
curl -X POST http://localhost:4000/api/rag/upload \
  -F "pdf=@/absolute/path/to/file.pdf"
```

3. Chat Query (core API):
```bash
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize the uploaded document","mode":"baseline"}'
```

4. Chat Query advanced mode:
```bash
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Summarize key risks","mode":"advanced"}'
```

5. Telemetry Feedback:
```bash
curl -X POST http://localhost:4000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"score":"thumbs_up","threadId":"some-thread-uuid"}'
```

## Ops Commands

Start:
```bash
docker compose up -d --build
```

Start with GPU profile:
```bash
docker compose --profile gpu up -d --build
```

Logs:
```bash
docker compose logs -f backend frontend postgres chroma
```

Stop:
```bash
docker compose down
```

Stop and remove volumes:
```bash
docker compose down -v
```

## Rollback Notes

If a deployment change fails locally:

1. Stop current stack:
```bash
docker compose down
```

2. Check out previous known-good commit.

3. Rebuild and start:
```bash
docker compose up -d --build
```

4. Re-run smoke tests above.

## Release Checklist

- `backend/.env` contains no real secrets committed to git.
- `docker compose config` is valid.
- Backend health endpoint returns healthy.
- PDF upload and `POST /api/chat` both work.
- Frontend loads and can submit chat query.
- Logs are clean for backend start and DB migration/init.

## Component Docs

- Backend internals: `backend/README.md`
- Frontend internals: `frontend/README.md`

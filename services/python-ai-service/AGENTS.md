# services/python-ai-service/AGENTS.md

Python 3.12, managed with `uv`. REST on 8000 (`app/api/rest_router.py`), gRPC on 50051 (`app/grpc_server/ai_service_grpc.py`). Owns all RAG work: file extraction, parent-child chunking, embeddings, hybrid search (HNSW + `pg_trgm` + RRF), cross-encoder reranking. Background: `docs/architecture/hybrid-rag.md`, ADR-004, ADR-006.

## Layout

| Path | Purpose |
|---|---|
| `app/services/file_processor/` | PDF / CSV / image / text extraction |
| `app/services/rag_processor/` | `chunker.py`, `database.py` (`taskflow_ai` schema + RRF SQL), `reranker.py` |
| `app/temporal/` | Ingestion workflows (`rag-ingest-queue`) |
| `app/telemetry/` | `json_logger.py` (use it; no `print()`), tracing, shadow evaluator |
| `tests/` | Pytest. `conftest.py` points tests at `taskflow_ai_test` |
| `evaluation/` | RAG / LLM-judge evaluations |

## Commands

```bash
uv sync
uv run pytest                        # all tests
uv run pytest tests/test_rag_processor.py   # one file
```

## Rules

- This service writes only to `taskflow_ai` (tests: `taskflow_ai_test`). Never write app state, traces or settings here.
- gRPC contract changes: edit `proto/ai_service.proto`, this server and `backend/src/grpc/client.js` in the same PR, with tests on both sides.
- Embeddings and generation go to local Ollama only.
- Keep the REST and gRPC behaviour the same for any endpoint that exists on both.

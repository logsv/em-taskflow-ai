---
name: rag-pipeline-ops
description: Use when working on document upload/ingestion (PDF, CSV, text, images), chunking, embeddings, HyDE, hybrid dense+sparse search with RRF, Cross-Encoder reranking/MMR, single-pass answer synthesis (retriever.js), file-attachment Map-Reduce compression, or chat-history compression. Spans backend/src/rag, backend/src/routes/rag.js and services/python-ai-service.
---

# RAG Pipeline & Pre-LLM Compression Operations

## Pipeline map

| Stage | Location |
|---|---|
| Upload API | `backend/src/routes/rag.js` → `/api/v1/rag/*`; chat attachments → `/api/v1/chat/upload` (`backend/src/routes/upload.js`) |
| Durable ingestion | Temporal workflow on queue `rag-ingest-queue` (`backend/src/temporal/`) |
| Parent-child chunking | `services/python-ai-service` (`chunker.py`) |
| Vector store | DB `taskflow_ai`, table `pdf_chunks`, pgvector HNSW index + `pg_trgm` |
| Hybrid search + RRF (`1/(60+rank)` SQL CTE) | `services/python-ai-service` (`database.py`) |
| Rerank + MMR dedupe | `CrossEncoderReranker.rerank`, REST `/api/v1/rag/search` in `app/api/rest_router.py` |
| HyDE + single-pass synthesis | `backend/src/rag/retriever.js` — `generateHypotheticalDocument`, `generateAnswer` |
| Node → Python transport | gRPC client `backend/src/grpc/client.js` (`pythonAIServiceClient`) |
| Attachment compression (>15k chars, Map-Reduce) | `summarize_with_langchain()` in `app/services/file_processor/pdf_extractor.py` |
| Chat-history anchoring (>10 turns → keep 8, summarise rest) | `optimizeChatHistory()` in `backend/src/application/chat/ChatApplicationService.js` |
| Admin chunk inspection | `GET/DELETE /api/v1/admin/documents[/:filename[/chunks]]` in `backend/src/routes/admin.js` |

## Rules

- **All RAG embedding/search goes through the Python service.** Don't add vector SQL to the Node backend.
- **Single pass.** `generateAnswer()` emits the `### 📄 Executive Summary` / `### 🔍 Key Document Analysis & Rubric Guidelines` / `### 📌 Source Citations` sections directly. RAG hits (`decision.ragHit = true`) bypass `responseFormatter.js`; don't add a second LLM pass.
- RAG vectors live only in `taskflow_ai`; never write chunks to `taskflow_backend`.
- Document upload/delete must trigger cache invalidation (see `multi-tier-caching-ops`).
- Changes to retrieval or chunking: run `npm run eval:rag` (backend) and the Python RAG evaluator.

## Verify

```bash
# Backend RAG + compression specs (from backend/)
npx jasmine --config=jasmine.json test/rag/**/*.spec.js test/routes/uploadRoute.spec.js test/application/uploadPdfApplicationService.spec.js test/application/chatHistoryOptimization.spec.js
```

```bash
# Python service (from services/python-ai-service/)
uv run pytest
```

```bash
# Live search with rerank + MMR (stack running)
curl -s -X POST http://localhost:8000/api/v1/rag/search -H "Content-Type: application/json" -d '{"query": "rubric guidelines", "top_k": 5}'
```

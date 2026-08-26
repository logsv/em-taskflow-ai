---
name: rag-pdf-ingestion
description: Procedures for testing PDF ingestion, HyDE query transformation, CTE-based RRF hybrid search, Redis semantic caching, taskflow_ai vector store, and single-pass RAG synthesis in EM TaskFlow AI.
---

# RAG Document Ingestion & Retrieval Skill

Use this skill when developing, testing, or troubleshooting multi-format document uploads (PDF, CSV, Images, Text), HyDE query expansion, Reciprocal Rank Fusion (RRF) search, Redis semantic caching, or vector chunk inspection.

---

## 📌 Architecture Overview

1. **Document Ingestion**:
   - Endpoint: `POST /api/rag/upload` (Supports PDF, CSV, Plain Text, PNG/JPG).
   - Ingests durably via Temporal workflow on queue `rag-ingest-queue`.
   - Tokenizes documents into parent-child chunks (`chunker.py`).
   - Stores vector embeddings in PostgreSQL database `taskflow_ai`, table `pdf_chunks` with `pgvector` HNSW index (`idx_pdf_chunks_embedding`).

2. **Redis Vector Semantic Caching**:
   - Intercepts queries before LLM generation via `src/cache/semanticCache.js`.
   - Cosine similarity >= **0.95** triggers a cache hit returning instant response (<50ms) with 1-hour TTL.

3. **HyDE Query Transformation & RRF Hybrid Search**:
   - `generateHypotheticalDocument` generates candidate hypothetical document answers.
   - Executes SQL CTE Reciprocal Rank Fusion (RRF) merging dense `pgvector` HNSW search with sparse `pg_trgm` BM25 search ($1.0 / (60 + rank)$).
   - Reranks top candidates via Cross-Encoder (`reranker.py`).

4. **Document Inventory & Chunk Inspection**:
   - Endpoint: `GET /api/admin/documents` (lists ingested documents and total chunks)
   - Endpoint: `GET /api/admin/documents/:filename/chunks` (retrieves exact text chunks for a document)
   - Endpoint: `DELETE /api/admin/documents/:filename` (purges document chunks from vector store)

5. **Single-Pass Answer Synthesis**:
   - `generateAnswer()` in `backend/src/rag/retriever.js` generates structured markdown sections (`### 📄 Executive Summary`, `### 🔍 Key Document Analysis`, `### 📌 Source Citations`) directly in 1 LLM pass.

---

## 🧪 Verification Commands

### Test Document Chunk Inspection via Admin API
```bash
curl -s http://localhost:4000/api/admin/documents/sample.pdf/chunks
```

### Run Python AI RAG Test Suite (39 Specs)
```bash
cd services/python-ai-service
uv run pytest
```

### Run Backend Test Suite (240 Specs)
```bash
cd backend
npm test
```

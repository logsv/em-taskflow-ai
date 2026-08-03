---
name: rag-pdf-ingestion
description: Procedures for testing PDF ingestion, PostgreSQL hybrid search, in-memory fallbacks, and single-pass RAG synthesis in EM TaskFlow AI.
---

# RAG PDF Ingestion & Retrieval Skill

Use this skill when developing, testing, or troubleshooting PDF document uploads, hybrid keyword search, or RAG answer generation.

## 📌 Architecture Overview

1. **PDF Ingestion**:
   - Endpoint: `POST /api/rag/upload`
   - Splits PDFs into token-aware parent-child chunks (`TokenTextSplitter`).
   - Stores chunks in PostgreSQL table `pdf_chunks` (with `inMemoryPdfChunks` fallback if DB is unavailable).

2. **Document History & Listing**:
   - Endpoint: `GET /api/rag/documents`
   - Un-gated endpoint returning document IDs, filenames, chunk counts, and upload timestamps.

3. **Hybrid Keyword Search**:
   - Tokenizes queries (e.g. `"5 analysis from rubrics pdf"`) and removes stop words (`"what"`, `"is"`, `"in"`).
   - Queries `pdf_chunks` using `pg_trgm` full-text search and vector distance.

4. **Single-Pass Answer Synthesis**:
   - `generateAnswer()` in `backend/src/rag/retriever.js` generates structured markdown sections (`### 📄 Executive Summary`, `### 🔍 Key Document Analysis`, `### 📌 Source Citations`) directly in 1 LLM pass.

## 🧪 Verification Commands

### Test PDF Search & Ingestion via Node CLI
```bash
node -e "import('./src/db/postgres.js').then(async (m) => { const db = m.default; console.log('Doc List:', await db.listPdfDocuments()); console.log('Search:', await db.hybridSearchPdfChunks({ query: 'rubrics' })); });"
```

### Run Backend RAG Test Suite
```bash
npm test -- --spec=test/rag/rag.spec.js
```

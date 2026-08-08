---
name: pre-llm-compression-ops
description: Operational procedures for Pre-LLM Preprocessing & Compression Suite including LangChain Map-Reduce file compression, RAG Cross-Encoder reranking with MMR deduplication, and Chat History sliding window state anchoring in EM TaskFlow AI.
---

# Pre-LLM Preprocessing & Compression Skill

Use this skill when developing, testing, or troubleshooting token compression and pre-LLM optimizations in EM TaskFlow AI.

## 📌 Architecture Overview

1. **File Attachment LangChain Compression**:
   - Python AI Service: `summarize_with_langchain()` in `app/services/file_processor/pdf_extractor.py`.
   - Automatically compresses uploaded text (PDF, CSV, Word, Text) exceeding 15,000 characters using `RecursiveCharacterTextSplitter` and Map-Reduce summarization.
   - Reduces token footprint by **3x to 5x** before injecting file content into chat prompts.

2. **RAG Vector Reranking & MMR Deduplication**:
   - Python AI Service REST Router: `/api/v1/rag/search` in `app/api/rest_router.py`.
   - Performs Cross-Encoder Reranking (`CrossEncoderReranker.rerank`) on PostgreSQL `pdf_chunks` candidate matches.
   - Applies **Maximal Marginal Relevance (MMR)** deduplication to eliminate redundant/overlapping text snippets before building RAG context.

3. **Chat History Sliding Window & State Anchoring**:
   - Backend Service: `optimizeChatHistory()` in `backend/src/application/chat/ChatApplicationService.js`.
   - When conversation history exceeds 10 turns, keeps the latest 8 active turns verbatim and compresses older turns into a 2-line `[System Memory: Conversation Summary Anchor]` block.

## 🧪 Verification Commands

### Test Chat History Optimization Spec
```bash
npx jasmine test/application/chatHistoryOptimization.spec.js
```

### Test Python AI Service REST Search with MMR
```bash
curl -X POST http://localhost:8000/api/v1/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "rubric guidelines", "top_k": 5}'
```

### Run Full Backend Upload & Search Specs
```bash
npx jasmine test/routes/uploadRoute.spec.js test/application/uploadPdfApplicationService.spec.js
```

# Production Hybrid RAG Engine

EM TaskFlow AI features a production-grade Hybrid RAG pipeline combining **Hypothetical Document Embeddings (HyDE)**, **Reciprocal Rank Fusion (RRF)**, **Dense HNSW Vector Search**, **Sparse BM25 Keyword Search**, and **Cross-Encoder Reranking**.

---

## 🔄 RAG Retrieval Lifecycle

```
[ User Query ]
      │
      ├── 1. HyDE Query Expansion (Generates hypothetical candidate document answers)
      │
      ├── 2. Parallel Search via PostgreSQL CTE Query (taskflow_ai DB)
      │     ├── Dense Vector Search: HNSW Cosine Distance (embedding <=> %s::vector)
      │     └── Sparse BM25 Search: pg_trgm Trigram Matching (ts_rank_cd)
      │
      ├── 3. Reciprocal Rank Fusion (RRF)
      │     └── rrf_score = 1 / (60 + dense_rank) + 1 / (60 + sparse_rank)
      │
      ├── 4. Cross-Encoder Reranking (FlashRank / TinyBERT local Transformer)
      │
      ├── 5. Maximal Marginal Relevance (MMR) Deduplication (Removes redundant chunks)
      │
      └── 6. Single-Pass Structured Answer Generation
            ├── ### 📄 Executive Summary
            ├── ### 🔍 Key Document Analysis & Rubric Guidelines
            └── ### 📌 Source Citations
```

---

## ⚡ SQL CTE Reciprocal Rank Fusion Query

Executed directly in PostgreSQL against `pdf_chunks` in `taskflow_ai`:

```sql
WITH dense_search AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> %s::vector) AS rank
    FROM pdf_chunks 
    ORDER BY embedding <=> %s::vector 
    LIMIT 60
),
sparse_search AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', content), query) DESC) AS rank
    FROM pdf_chunks, plainto_tsquery('english', %s) query
    WHERE to_tsvector('english', content) @@ query 
    LIMIT 60
)
SELECT p.id, p.filename, p.content, COALESCE(p.parent_content, p.content) AS parent_content, p.metadata,
       COALESCE(1.0 / (60 + d.rank), 0.0) + COALESCE(1.0 / (60 + s.rank), 0.0) AS rrf_score
FROM dense_search d 
FULL OUTER JOIN sparse_search s ON d.id = s.id
JOIN pdf_chunks p ON p.id = COALESCE(d.id, s.id)
ORDER BY rrf_score DESC 
LIMIT %s;
```

---

## 🔪 Parent-Child Token Chunking
When documents are ingested:
- Documents are split into 512-token child chunks with overlapping boundaries.
- For each child chunk, the full parent section window (`parent_content`) is stored alongside the child text.
- During synthesis, the parent context is injected into LLM prompts, preventing fragmented document understanding.

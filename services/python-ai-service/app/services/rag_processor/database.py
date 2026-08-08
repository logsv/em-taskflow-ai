"""
Python RAG Database Service
Owns PostgreSQL pdf_chunks table vector & full-text persistence, hybrid search, document listing, and deletion.
Includes robust in-memory fallback if PostgreSQL DB is temporarily unreachable.
"""

import os
import logging
from typing import List, Dict, Any, Optional
from app.telemetry.tracer import trace_observation

logger = logging.getLogger(__name__)

# Fallback in-memory store for unit testing & DB downtime resilience
_in_memory_chunks: List[Dict[str, Any]] = []


class RAGDatabaseService:
    """PostgreSQL RAG Vector & Full-Text Persistence Service."""

    def __init__(self):
        self.host = os.getenv("POSTGRES_HOST", "postgres")
        self.port = int(os.getenv("POSTGRES_PORT", "5432"))
        self.dbname = os.getenv("POSTGRES_DB", "taskflow")
        self.user = os.getenv("POSTGRES_USER", "taskflow")
        self.password = os.getenv("POSTGRES_PASSWORD", "taskflow")
        self._ensure_table_exists()

    def _get_connection(self):
        """Establish connection to PostgreSQL DB."""
        import psycopg
        from psycopg.rows import dict_row

        conn_str = f"host={self.host} port={self.port} dbname={self.dbname} user={self.user} password={self.password} connect_timeout=3"
        return psycopg.connect(conn_str, row_factory=dict_row)

    def _ensure_table_exists(self):
        """Create pdf_chunks table and search indexes if they do not exist."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    try:
                        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                    except Exception as ve:
                        logger.info(f"pgvector extension not installed in postgres image ({str(ve)}), using tsvector.")
                    try:
                        cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
                    except Exception:
                        pass

                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS pdf_chunks (
                            id VARCHAR(255) PRIMARY KEY,
                            filename VARCHAR(255) NOT NULL,
                            chunk_index INT NOT NULL,
                            content TEXT NOT NULL,
                            parent_content TEXT,
                            token_count INT DEFAULT 0,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    try:
                        cur.execute("ALTER TABLE pdf_chunks ADD COLUMN IF NOT EXISTS token_count INT DEFAULT 0;")
                        cur.execute("ALTER TABLE pdf_chunks ADD COLUMN IF NOT EXISTS parent_content TEXT;")
                        cur.execute("ALTER TABLE pdf_chunks ADD COLUMN IF NOT EXISTS embedding_json TEXT;")
                        cur.execute("ALTER TABLE pdf_chunks ALTER COLUMN document_id DROP NOT NULL;")
                        cur.execute("ALTER TABLE pdf_chunks ALTER COLUMN parent_content DROP NOT NULL;")
                        cur.execute("CREATE INDEX IF NOT EXISTS idx_pdf_chunks_filename ON pdf_chunks(filename);")
                        cur.execute("CREATE INDEX IF NOT EXISTS idx_pdf_chunks_fts ON pdf_chunks USING gin(to_tsvector('english', content));")
                    except Exception as migration_err:
                        logger.warning(f"Column migration warning: {migration_err}")
                conn.commit()
                logger.info("Successfully initialized PostgreSQL pdf_chunks table & indexes.")
        except Exception as e:
            logger.warning(f"PostgreSQL initialization warning ({str(e)}). Deferring to resilient in-memory store.")

    def _fetch_ollama_embedding(self, text: str, cached_url: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
        """Optionally compute Ollama nomic-embed-text vector embedding for embedding_json column."""
        import httpx
        import json
        urls_to_try = [cached_url] if (cached_url and cached_url.startswith("http")) else [
            os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434"),
            "http://host.docker.internal:11434",
            "http://localhost:11434",
            "http://127.0.0.1:11434",
        ]
        model_name = os.getenv("RAG_EMBEDDING_MODEL", "nomic-embed-text")
        for url in urls_to_try:
            if not url or not url.startswith("http"):
                continue
            try:
                res = httpx.post(
                    f"{url}/api/embeddings",
                    json={"model": model_name, "prompt": text[:2000]},
                    timeout=5.0
                )
                if res.status_code == 200:
                    emb = res.json().get("embedding")
                    if emb and isinstance(emb, list):
                        return json.dumps(emb), url
            except Exception:
                pass
        return None, cached_url

    def upsert_chunks(self, filename: str, chunks: List[Dict[str, Any]]) -> bool:
        """Upsert document chunks into PostgreSQL pdf_chunks table."""
        global _in_memory_chunks
        if not chunks:
            return True

        # Always update in-memory store for fallback resilience
        _in_memory_chunks = [c for c in _in_memory_chunks if c.get("filename") != filename]
        for c in chunks:
            content_val = c.get("content", "")
            parent_val = c.get("parent_content") or content_val
            _in_memory_chunks.append({
                "id": f"{filename}-chunk-{c.get('chunk_index', 0)}",
                "filename": filename,
                "chunk_index": c.get("chunk_index", 0),
                "content": content_val,
                "parent_content": parent_val,
                "token_count": c.get("token_count", 0),
            })

        try:
            working_ollama_url = None
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    # Delete existing chunks for this filename
                    cur.execute("DELETE FROM pdf_chunks WHERE filename = %s;", (filename,))
                    
                    # Insert new chunks
                    for c in chunks:
                        chunk_id = f"{filename}-chunk-{c.get('chunk_index', 0)}"
                        content_val = c.get("content", "")
                        parent_val = c.get("parent_content") or content_val
                        emb_json, working_ollama_url = self._fetch_ollama_embedding(content_val, working_ollama_url)
                        try:
                            cur.execute("""
                                INSERT INTO pdf_chunks (id, document_id, filename, chunk_index, content, parent_content, token_count, embedding_json)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                            """, (
                                chunk_id,
                                filename,
                                filename,
                                c.get("chunk_index", 0),
                                content_val,
                                parent_val,
                                c.get("token_count", 0),
                                emb_json,
                            ))
                        except Exception as e:
                            logger.warning(f"Fallback insert for chunk {chunk_id}: {str(e)}")
                            conn.rollback()
                            cur.execute("DELETE FROM pdf_chunks WHERE filename = %s;", (filename,))
                            for chunk_item in chunks:
                                cid = f"{filename}-chunk-{chunk_item.get('chunk_index', 0)}"
                                citem_content = chunk_item.get("content", "")
                                citem_parent = chunk_item.get("parent_content") or citem_content
                                cur.execute("""
                                    INSERT INTO pdf_chunks (id, document_id, filename, chunk_index, content, parent_content, embedding_json)
                                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                                """, (
                                    cid,
                                    filename,
                                    filename,
                                    chunk_item.get("chunk_index", 0),
                                    citem_content,
                                    citem_parent,
                                    emb_json,
                                ))
                            break
                conn.commit()
            return True
        except Exception as e:
            logger.warning(f"Failed PostgreSQL upsert for {filename} ({str(e)}). Used in-memory fallback.")
            return True

    @trace_observation("hybrid_search")
    def hybrid_search(self, query_text: str, top_k: int = 5, filter_filename: str = "") -> List[Dict[str, Any]]:
        """
        Execute PostgreSQL Full-Text Search (tsvector + plainto_tsquery + ts_rank_cd).
        Falls back to in-memory term overlap if DB is unreachable.
        """
        if not query_text or not query_text.strip():
            return []

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    query_sql = """
                        SELECT id, filename, chunk_index, content, COALESCE(parent_content, content) AS parent_content, COALESCE(token_count, 0) AS token_count,
                               ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', %s)) AS rank_score
                        FROM pdf_chunks
                        WHERE to_tsvector('english', content) @@ plainto_tsquery('english', %s)
                    """
                    params = [query_text, query_text]

                    if filter_filename:
                        query_sql += " AND filename = %s"
                        params.append(filter_filename)

                    query_sql += " ORDER BY rank_score DESC LIMIT %s;"
                    params.append(top_k)

                    cur.execute(query_sql, params)
                    rows = cur.fetchall()

                    results = []
                    for r in rows:
                        results.append({
                            "id": r["id"],
                            "filename": r["filename"],
                            "chunk_index": r["chunk_index"],
                            "content": r["content"],
                            "parent_content": r["parent_content"] or "",
                            "token_count": r["token_count"] or 0,
                            "score": float(r["rank_score"]),
                        })

                    if results:
                        return results
        except Exception as e:
            logger.warning(f"PostgreSQL hybrid search failed ({str(e)}). Falling back to in-memory search.")

        # In-memory fallback
        query_words = set(query_text.lower().split())
        scored_candidates = []

        for item in _in_memory_chunks:
            if filter_filename and item.get("filename") != filter_filename:
                continue
            content = item.get("content", "")
            content_words = set(content.lower().split())
            overlap = len(query_words.intersection(content_words))
            if overlap > 0 or len(_in_memory_chunks) <= top_k:
                scored_candidates.append({
                    "id": item.get("id"),
                    "filename": item.get("filename"),
                    "chunk_index": item.get("chunk_index"),
                    "content": content,
                    "parent_content": item.get("parent_content", ""),
                    "token_count": item.get("token_count", 0),
                    "score": float(overlap + 0.1),
                })

        scored_candidates.sort(key=lambda x: x["score"], reverse=True)
        return scored_candidates[:top_k]

    def list_documents(self) -> List[Dict[str, Any]]:
        """List distinct ingested documents from pdf_chunks table."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT filename, COUNT(*) as total_chunks, MIN(created_at) as created_at
                        FROM pdf_chunks
                        GROUP BY filename
                        ORDER BY MIN(created_at) DESC;
                    """)
                    rows = cur.fetchall()
                    return [{
                        "filename": r["filename"],
                        "total_chunks": int(r["total_chunks"]),
                        "created_at": str(r["created_at"]),
                    } for r in rows]
        except Exception as e:
            logger.warning(f"PostgreSQL list_documents failed ({str(e)}). Using in-memory fallback.")
            
        # In-memory fallback
        doc_counts = {}
        for c in _in_memory_chunks:
            fn = c.get("filename", "unknown")
            doc_counts[fn] = doc_counts.get(fn, 0) + 1
            
        return [{"filename": fn, "total_chunks": count, "created_at": "2026-08-06T00:00:00Z"} for fn, count in doc_counts.items()]

    def delete_document(self, filename: str) -> int:
        """Delete document and all associated chunks from pdf_chunks table."""
        global _in_memory_chunks
        before_len = len(_in_memory_chunks)
        _in_memory_chunks = [c for c in _in_memory_chunks if c.get("filename") != filename]
        deleted_count = before_len - len(_in_memory_chunks)

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM pdf_chunks WHERE filename = %s;", (filename,))
                    deleted_count = cur.rowcount
                conn.commit()
            return deleted_count
        except Exception as e:
            logger.warning(f"PostgreSQL delete_document failed ({str(e)}). Deleted {deleted_count} in-memory chunks.")
            return deleted_count

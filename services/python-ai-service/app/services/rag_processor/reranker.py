"""
Cross-Encoder Reranker Engine
Filters and orders candidate retrieved chunks to eliminate hallucinations and semantic drift.
Uses FlashRank (lightweight Cross-Encoder) with fallback term overlap scoring.
"""

import time
import logging
from app.telemetry.tracer import trace_observation

logger = logging.getLogger("app.reranker")


class CrossEncoderReranker:
    """Lightweight Cross-Encoder reranker using FlashRank or keyword overlap fallback."""

    def __init__(self):
        self._ranker = None

    def _get_ranker(self):
        if self._ranker is None:
            try:
                from flashrank import Ranker
                self._ranker = Ranker(model_name="ms-marco-TinyBERT-L-2-v2", cache_dir="/tmp/flashrank")
            except Exception as e:
                logger.warning(f"FlashRank init failed, using term-overlap fallback: {e}")
                self._ranker = False
        return self._ranker

    @trace_observation("cross_encoder_rerank")
    def rerank(self, query: str, candidate_chunks: list, top_n: int = 5) -> list:
        """
        Rerank candidate chunks for a query.
        Returns top_n items sorted by relevance score.
        """
        if not candidate_chunks:
            return []

        start_time = time.time()
        ranker = self._get_ranker()
        if ranker:
            try:
                passages = [
                    {
                        "id": c.get("id", str(i)),
                        "text": c.get("content", ""),
                        "meta": c,
                    }
                    for i, c in enumerate(candidate_chunks)
                ]
                from flashrank import RerankRequest
                rerank_req = RerankRequest(query=query, passages=passages)
                results = ranker.rerank(rerank_req)

                ranked = []
                for item in results[:top_n]:
                    meta = item.get("meta", {})
                    ranked.append({
                        "id": item.get("id", meta.get("id", "")),
                        "content": meta.get("content", item.get("text", "")),
                        "filename": meta.get("filename", ""),
                        "chunk_index": meta.get("chunk_index", 0),
                        "rerank_score": float(item.get("score", 0.0)),
                    })
                
                duration_ms = int((time.time() - start_time) * 1000)
                logger.info(
                    f"FlashRank reranked {len(candidate_chunks)} candidates -> top {len(ranked)} ({duration_ms}ms)",
                    extra={"details": {"candidates": len(candidate_chunks), "top_n": len(ranked), "duration_ms": duration_ms}}
                )
                return ranked
            except Exception as err:
                logger.warning(f"FlashRank execution warning, falling back: {err}")

        # Fallback scoring: term frequency + exact match overlap
        q_tokens = [w.lower() for w in query.split() if len(w) > 2]
        scored = []
        for c in candidate_chunks:
            text = c.get("content", "").lower()
            matches = sum(1 for t in q_tokens if t in text)
            scored.append({
                "id": c.get("id", ""),
                "content": c.get("content", ""),
                "filename": c.get("filename", ""),
                "chunk_index": c.get("chunk_index", 0),
                "rerank_score": float(matches / max(1, len(q_tokens))),
            })

        scored.sort(key=lambda x: x["rerank_score"], reverse=True)
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(
            f"Fallback term-overlap reranked {len(candidate_chunks)} candidates -> top {len(scored[:top_n])} ({duration_ms}ms)"
        )
        return scored[:top_n]

# Redis Semantic Caching

To reduce LLM latency and compute load, EM TaskFlow AI incorporates a high-speed vector semantic caching layer powered by **Redis 7** (`redis:7-alpine`).

---

## ⚡ How It Works

1. **Query Hashing & Embedding**:
   - An incoming query is converted to a vector embedding using `nomic-embed-text`.
   - A SHA-256 hash of the normalized prompt is generated.
2. **Vector Similarity Lookup**:
   - The query embedding is compared against cached query vectors stored in Redis.
3. **Threshold Gate ($\ge 0.95$)**:
   - If cosine similarity between the current query and a cached vector is **$\ge 0.95$**, it is classified as a Semantic Cache Hit.
   - The pre-computed response is returned in **$<50\text{ms}$**, completely bypassing LLM inference and tool routing.
4. **Cache Invalidation & TTL**:
   - Entries have a default **1-hour TTL** (Time To Live).
   - Document upload or manual cache flush invalidates stale keys.

---

## ⚙️ Configuration Parameters

| Parameter | Value | Description |
| :--- | :--- | :--- |
| `REDIS_URL` | `redis://localhost:6379` | Redis server connection URI |
| `SEMANTIC_CACHE_SIMILARITY_THRESHOLD` | `0.95` | Cosine similarity threshold for cache hits |
| `SEMANTIC_CACHE_TTL_SECONDS` | `3600` | Expiration time for cached responses (1 hour) |
| `MAX_MEMORY` | `256mb` | Container memory limit with `allkeys-lru` eviction |

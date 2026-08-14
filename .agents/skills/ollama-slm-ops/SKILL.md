---
name: ollama-slm-ops
description: Procedures for managing local Ollama SLM inference, model parameters, embedding models, and Open WebUI integration in EM TaskFlow AI.
---

# Ollama SLM & Model Operations Skill

Use this skill when configuring, testing, or troubleshooting local Ollama Small Language Models (`hermes3:8b`, `nomic-embed-text`), zero-cloud key policies, or Open WebUI integrations.

## 📌 Architecture Overview

1. **Local Ollama Inference Engine**:
   - URL: `http://localhost:11434` (or `http://host.docker.internal:11434` in Docker).
   - Default Models: `hermes3:8b` (Reasoning, Agent Supervisor & Evaluations) and `nomic-embed-text` (RAG Vector Embeddings).
   - Zero Cloud Key Requirement: External cloud providers disabled (`LLM_GOOGLE_ENABLED: false`, `LLM_OPENAI_ENABLED: false`).

2. **Open WebUI Container Integration**:
   - Container: `em-taskflow-open-webui` (`http://127.0.0.1:3080`).
   - Configured with `RAG_EMBEDDING_ENGINE=ollama` and `RAG_OLLAMA_MODEL=nomic-embed-text` to leverage local Ollama models with zero remote download delays.

3. **Fast-Path & Router Parameters**:
   - Model parameter tuning (temperature, context window length `num_ctx`, top_k) initialized via `src/llm/index.js`.

## 🧪 Verification Commands

### Test Local Ollama Connection & Loaded Models
```bash
curl -s http://localhost:11434/api/tags
```

### Test Direct Model Generation
```bash
curl -X POST http://localhost:11434/api/generate -d '{"model": "hermes3:8b", "prompt": "hi", "stream": false}'
```

### Check Open WebUI Health Status
```bash
docker compose ps open-webui
```

### Run Full Backend Test Suite
```bash
npm test
```

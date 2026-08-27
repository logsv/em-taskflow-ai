---
name: ollama-slm-ops
description: Procedures for managing local Ollama SLM inference, model parameters, embedding models, and zero-cloud key policies in EM TaskFlow AI.
---

# Ollama SLM & Model Operations Skill

Use this skill when configuring, testing, or troubleshooting local Ollama Small Language Models (`hermes3:8b`, `nomic-embed-text`), zero-cloud key policies, and model parameters.

---

## 📌 Architecture Overview

1. **Local Ollama Inference Engine**:
   - URL: `http://localhost:11434` (or `http://host.docker.internal:11434` in Docker).
   - Default Models: `hermes3:8b` (Reasoning, Agent Supervisor & Evaluations) and `nomic-embed-text` (RAG Vector Embeddings).
   - Supported Model Presets: `hermes3:8b`, `qwen2.5:14b`, `mistral-small:24b`, `qwen2.5:32b`, `command-r:35b`, `llama3.3:70b`, `gpt-oss:20b`, `mistral:latest`, `llama3.1:8b`, `nomic-embed-text`.
   - Zero Cloud Key Requirement: External cloud providers disabled (`LLM_GOOGLE_ENABLED: false`, `LLM_OPENAI_ENABLED: false`).

2. **Fast-Path & Router Parameters**:
   - Model parameter tuning (temperature default 0.2, context window length `num_ctx`, top_k) initialized via `src/llm/index.js` and persisted in `app_settings`.
   - **Database Persistence**: Model parameters and provider configurations in `app_settings` must never be dropped or cleared.

---

## 🧪 Verification Commands

### Test Local Ollama Connection & Loaded Models
```bash
curl -s http://localhost:11434/api/tags
```

### Test Direct Model Generation
```bash
curl -X POST http://localhost:11434/api/generate -d '{"model": "hermes3:8b", "prompt": "hi", "stream": false}'
```

### Run Full Backend Test Suite (240 Specs)
```bash
cd backend
npm test
```

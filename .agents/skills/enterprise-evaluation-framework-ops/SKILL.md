---
name: enterprise-evaluation-framework-ops
description: Operational procedures for managing, executing, calibrating, and extending the 3-Phase Enterprise Evaluation Framework including Golden Dataset repository, strategy evaluators, LLM-as-a-Judge CoT & Pairwise Arena calibration, RAG retrieval evaluation, Fast-Path SLA gates, shadow telemetry worker, git pre-push verification hook, and CI/CD pipelines in EM TaskFlow AI.
---

# Enterprise Evaluation Framework Operational Skill

Use this skill when running, extending, calibrating, or debugging the 3-Phase Enterprise Evaluation Framework in EM TaskFlow AI.

---

## 🏗️ Architecture Overview

The Enterprise Evaluation Framework provides deterministic, automated SLA testing across Node.js backend routing, Python AI RAG retrieval, and LLM-as-a-Judge model output alignment using **100% Local LLM Inference (`hermes3:8b`)**.

```
                           [ Golden Dataset Repository ]
                           (golden-dataset.json & schema)
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
   [ Node.js Strategy Runner ]  [ Python RAG Evaluator ]  [ LLM-as-a-Judge Factory ]
   ├── MultiAgentTrajectory    ├── ContextPrecision       ├── G-Eval Chain-of-Thought
   ├── RAGPipelineStrategy     ├── ContextRecall          ├── Pairwise Arena Dual-Pass
   └── PreLLMProcessorChain    └── HyDE Synergy Lift      └── CoT Reasoning Alignment
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
                         [ SLA Success Gate Enforcement ]
                         ├── Domain Selection Accuracy (>=90%)
                         ├── Unwanted RAG Rate (<=5%)
                         ├── Tool Grounded Rate (>=95%)
                         └── Fast-Path Latency (<300ms)
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
  [ Local Git Pre-Push Hook ]                              [ Shadow Telemetry Worker ]
  (.git/hooks/pre-push)                                    (5% trace sampling to langfuse_db)
```

---

## 🛠️ Key Components & File Locations

1. **Golden Dataset Repository**:
   - Schema: [`backend/evaluation/golden-dataset-schema.json`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/golden-dataset-schema.json)
   - Dataset: [`backend/evaluation/golden-dataset.json`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/golden-dataset.json)
2. **Node.js Composite Strategy Evaluator**:
   - Strategy Runner: [`backend/evaluation/run-evaluation.js`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/run-evaluation.js)
   - Evaluator Strategies: [`backend/evaluation/evaluators/`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/evaluators/)
     - `multi-agent-eval.js` (MultiAgentTrajectoryStrategy)
     - `rag-eval.js` (RAGPipelineStrategy)
     - `pre-llm-eval.js` (PreLLMProcessorChain)
3. **Python AI RAG Evaluator & LLM Judges**:
   - Python Evaluator: [`services/python-ai-service/evaluation/rag_evaluator.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/rag_evaluator.py)
   - LLM Judge Factory: [`services/python-ai-service/evaluation/llm_judge.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/llm_judge.py)
   - Shadow Telemetry Worker: [`services/python-ai-service/app/telemetry/shadow_evaluator.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/app/telemetry/shadow_evaluator.py)
4. **Git Pre-Push Hook & CI Workflows**:
   - Local Hook: [`.git/hooks/pre-push`](file://.git/hooks/pre-push)
   - Backend CI Workflow: [`.github/workflows/backend-ci.yml`](file://.github/workflows/backend-ci.yml)
   - Path-Based CI Router: [`.github/workflows/ci.yml`](file://.github/workflows/ci.yml)

---

## ⚡ Operational Commands

### 1. Run Complete Evaluation Suite
```bash
npm run eval:enterprise    # Runs Node evaluate, DeepEval, Ragas, and TruLens
```

### 2. Run Official Framework Evaluation Sub-Suites
```bash
# DeepEval Agent Trajectory Tests (Pytest)
npm run eval:deepeval

# Ragas Hybrid RAG Evaluation (Faithfulness, Precision, Recall)
npm run eval:ragas

# TruLens RAG Triad Evaluation (Groundedness, Context Relevance)
npm run eval:trulens

# Launch TruLens Streamlit Leaderboard Dashboard (Port 8501)
npm run eval:trulens:dashboard

# Promptfoo Prompt Matrix & Red-Teaming (Synced to Promptfoo Managed Cloud)
npm run eval:promptfoo

# Log in to Promptfoo Managed Cloud CLI
npm run eval:promptfoo:login
```

### 3. Run Node.js Strategy Evaluators & Pytests
```bash
cd backend && npm run evaluate
cd services/python-ai-service && uv run pytest
```

### 4. Admin Portal Hub Links
- **Langfuse Unified Evaluation Dashboard**: `http://localhost:3000`
- **Promptfoo Managed Cloud**: `https://www.promptfoo.app` (Organization: `emtaskflow-ai`)
- **TruLens Leaderboard**: `http://localhost:8501`
- **Adminer DB Explorer**: `http://localhost:8080`
- **Open WebUI**: `http://localhost:3080`

---

## 🔒 Verification & Quality Rules

1. **Rule of 100% Local Inference**:
   - All evaluation tasks (routing classification, HyDE expansion, single-pass RAG synthesis, G-Eval CoT scoring, and Pairwise Arena evaluation) must execute against local Ollama running `hermes3:8b`.
2. **Rule of Non-Blocking Telemetry Scores**:
   - Evaluation metrics logged via `scoreTrace()` to `langfuse_db` (port 5433) must be wrapped in `try/catch` and execute asynchronously without blocking API request lifecycle or breaking build pipelines.
3. **Rule of Strict Gate SLA Compliance**:
   - Pull requests and pre-push operations require:
     - Domain Selection Accuracy $\ge 90\%$
     - Unwanted RAG Rate $\le 5\%$
     - Tool Grounded Rate $\ge 95\%$
     - Fast-Path SLA $< 300\text{ms}$

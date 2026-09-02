# 🎯 DeepEval, Ragas & LLM-as-a-Judge Benchmarking

EM TaskFlow AI utilizes a comprehensive evaluation suite combining **DeepEval**, **Ragas**, **LLM-as-a-Judge (Pairwise Arena & G-Eval CoT)**, and **Historical Trace Replay** to evaluate local SLM performance.

---

## ⚖️ Python LLM-as-a-Judge (`llm_judge.py`)

Located in [`services/python-ai-service/evaluation/llm_judge.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/llm_judge.py):

### 1. G-Eval Chain-of-Thought (CoT) Scoring
Evaluates synthesized answers against multi-dimensional rubrics using structured step-by-step reasoning:
- **SBI Constructiveness**: Confirms feedback is actionable and debiased.
- **Blameless Retrospective Posture**: Ensures post-mortems maintain a systemic improvement focus.
- **Mathematical Velocity Precision**: Verifies 70/20/10 capacity allocation math.

### 2. Pairwise Arena Model Comparisons
Pits candidate SLM upgrades (e.g. `mistral:latest` vs `hermes3:8b`) head-to-head on identical prompts, evaluating:
- Domain routing precision
- Tool invocation grounding
- Executive summary clarity

---

## 🎯 DeepEval Trajectory Testing (12 GEval Specs)

Located in [`services/python-ai-service/evaluation/deepeval_hermes.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/deepeval_hermes.py):
- **1-Tool Constraint Adherence**: Confirms domain sub-agents execute at most 1 tool definition per step.
- **Fact-Matrix Retention**: Verifies that active session facts are preserved across long conversations without context bloat.
- **Anti-Blame Retrospective Stance**: Ensures retro outputs generate SMART action items.

---

## 🔍 Ragas Hybrid RAG Metrics

Located in [`services/python-ai-service/evaluation/ragas_runner.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/ragas_runner.py):
1. **Faithfulness**: Validates that generated answers contain only statements grounded in retrieved document chunks.
2. **Answer Relevancy**: Assesses whether synthesized summaries directly address user query intents.
3. **Context Precision**: Evaluates the signal-to-noise ratio of chunks retrieved via RRF and Cross-Encoder reranking.
4. **Context Recall**: Verifies that all ground-truth facts required to answer the question were retrieved.

---

## 🔄 Historical Trace Replay & Arena (`replay_langfuse_traces.py`)

Located in [`services/python-ai-service/evaluation/replay_langfuse_traces.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/replay_langfuse_traces.py):
- Extracts historical production failure traces or low-rated queries from `langfuse_db`.
- Replays queries through the multi-agent pipeline and compares candidate responses against baseline models.
- Dispatches evaluation results directly to Langfuse datasets.

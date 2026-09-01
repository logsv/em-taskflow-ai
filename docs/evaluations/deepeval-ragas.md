# DeepEval & Ragas Trajectory Benchmarking

EM TaskFlow AI utilizes **DeepEval** and **Ragas** to measure micro-agent reasoning steps, tool calling faithfulness, multi-turn Fact-Matrix memory retention, and hybrid RAG retrieval precision.

---

## 🎯 DeepEval Trajectory Testing (12 GEval Specs)

Located in [`services/python-ai-service/evaluation/deepeval_hermes.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/deepeval_hermes.py) and [`services/python-ai-service/tests/test_deepeval_agent_trajectories.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/tests/test_deepeval_agent_trajectories.py).

### Measured Metrics & Rubrics
- **SBI Feedback Quality & Debiasing**: Validates that performance feedback is constructive, specific, actionable, and scrubbed of toxic adjectives.
- **Anti-Blame Retrospective Stance**: Ensures post-mortems and retro summaries maintain a blameless, systemic improvement focus with SMART action items.
- **Sprint Capacity & Tech Debt Allocation**: Verifies 70/20/10 capacity allocation mathematical precision and PTO deduction accuracy.
- **Retro Thematic Clustering**: Evaluates semantic clustering into *What Went Well*, *Friction Points*, and assignable action items.
- **Fact-Matrix Session Memory Retention**: Verifies that active session facts (DORA baselines, referenced PRs, engineer handles) are remembered across long conversations without context bloat.
- **1-Tool Constraint Adherence**: Confirms domain sub-agents execute at most 1 tool definition per step (raising SLM accuracy past 95%).
- **DORA & Delivery Relevancy**: Assesses output grounding against live GitHub/Jira metrics.

---

## 🔍 Ragas Hybrid RAG Metrics

Located in [`services/python-ai-service/evaluation/ragas_runner.py`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/services/python-ai-service/evaluation/ragas_runner.py).

### Measured Metrics
1. **Faithfulness**: Validates that generated answers contain only statements grounded in retrieved document chunks.
2. **Answer Relevancy**: Assesses whether synthesized summaries directly address user query intents.
3. **Context Precision**: Evaluates the signal-to-noise ratio of chunks retrieved via RRF and Cross-Encoder reranking.
4. **Context Recall**: Verifies that all ground-truth facts required to answer the question were retrieved.


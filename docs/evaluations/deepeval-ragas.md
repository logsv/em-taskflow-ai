# DeepEval & Ragas Trajectory Benchmarking

EM TaskFlow AI utilizes **DeepEval** and **Ragas** to measure micro-agent reasoning steps, tool calling faithfulness, and hybrid RAG retrieval precision.

---

## 🎯 DeepEval Trajectory Testing

Located in `services/python-ai-service/evaluation/deepeval_hermes.py` and `tests/test_deepeval_agent_trajectories.py`.

### Measured Metrics
- **SBI Feedback Quality & Debiasing**: Validates that performance feedback is constructive, specific, and free of bias.
- **Anti-Blame Retrospective Stance**: Ensures post-mortems and retro summaries maintain a blameless, systemic improvement focus.
- **Tool Selection Precision**: Confirms sub-agents only call allowed tools within their domain boundaries.

---

## 🔍 Ragas Hybrid RAG Metrics

Located in `services/python-ai-service/evaluation/ragas_runner.py`.

### Measured Metrics
1. **Faithfulness**: Validates that generated answers contain only statements grounded in retrieved document chunks.
2. **Answer Relevancy**: Assesses whether synthesized summaries directly address user query intents.
3. **Context Precision**: Evaluates the signal-to-noise ratio of chunks retrieved via RRF and Cross-Encoder reranking.
4. **Context Recall**: Verifies that all ground-truth facts required to answer the question were retrieved.

# 3-Phase Evaluation Framework

EM TaskFlow AI implements an enterprise evaluation framework to continuously benchmark multi-agent routing precision, RAG retrieval faithfulness, and LLM output quality against local `hermes3:8b`.

---

## 🏗️ 3-Phase Architecture

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

## ⚡ Execution Commands

```bash
# Run full enterprise evaluation suite
npm run eval:enterprise

# Run Node.js composite evaluators
cd backend && npm run evaluate

# Run DeepEval agent trajectory benchmarks (Pytest)
npm run eval:deepeval

# Run Ragas Hybrid RAG metrics (Precision, Recall, Faithfulness)
npm run eval:ragas

# Launch Promptfoo Matrix Server
npm run eval:promptfoo
```

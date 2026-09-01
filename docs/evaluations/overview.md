# 3-Phase Evaluation Framework

EM TaskFlow AI implements an enterprise evaluation framework to continuously benchmark multi-agent routing precision, RAG retrieval faithfulness, and LLM output quality against local `hermes3:8b` across **140 schema-validated Golden Dataset test cases** and **5 EM Tau-Bench user personas**.

---

## 🏗️ 3-Phase Architecture

```
                           [ Golden Dataset Repository ]
                         (140 items in golden-dataset.json)
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
   [ Node.js Strategy Runner ]  [ Python RAG Evaluator ]  [ LLM-as-a-Judge Factory ]
   ├── MultiAgentTrajectory    ├── ContextPrecision       ├── G-Eval Chain-of-Thought
   ├── RAGPipelineStrategy     ├── ContextRecall          ├── Pairwise Arena Dual-Pass
   ├── ContextualResolution    ├── HyDE Synergy Lift      ├── Tau-Bench (5 Personas)
   └── PreLLMProcessorChain    └── DeepEval Trajectories  └── Fact-Matrix Retention
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
                         [ SLA Success Gate Enforcement ]
                         ├── Domain Selection Accuracy (>=90%)
                         ├── Unwanted RAG Rate (<=5%)
                         ├── Tool Grounded Rate (>=95%)
                         ├── Fast-Path Latency (<300ms)
                         └── 1-Tool Constraint Adherence (100%)
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

# Run Node.js composite evaluators (140 golden dataset items)
cd backend && npm run evaluate

# Run DeepEval agent trajectory benchmarks (12 GEval specs)
npm run eval:deepeval

# Run Ragas Hybrid RAG metrics (Precision, Recall, Faithfulness)
npm run eval:ragas

# Run TruLens RAG Triad Evaluation & Dashboard
npm run eval:trulens
npm run eval:trulens:dashboard

# Launch Promptfoo Matrix Server & Red-Teaming (32+ test assertions)
npm run eval:promptfoo
npm run eval:promptfoo:view
```


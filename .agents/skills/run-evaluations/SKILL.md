---
name: run-evaluations
description: Use when a change touches prompts, routing (llmRouter, agentService fast-path), agent tools, RAG retrieval or synthesis, or the golden dataset, and you need to check quality has not regressed.
---

# Run evaluations

Unit tests check code. Evaluations check model behaviour. Run the suite that matches what you changed.

## Prerequisites

- Ollama running at `http://localhost:11434` with `hermes3:8b` and `nomic-embed-text` pulled.
- Postgres up (`docker compose up -d postgres redis`). Evals use `taskflow_eval` / `taskflow_ai_eval`, never runtime databases.

## Which suite

| You changed | Run (from `backend/`) |
|---|---|
| Routing, domain prompts, agent tools | `npm run eval:multi-agent` |
| RAG retrieval, HyDE, synthesis format | `npm run eval:rag` and `cd ../services/python-ai-service && uv run pytest tests/test_rag_eval.py` |
| Pre-LLM compression, fast-path | `npm run eval:pre-llm` |
| Several of the above, or before a release | `npm run evaluate` |

## Reading results

- The runner prints pass/fail per gate. Gate thresholds are in `backend/evaluation/run-evaluation.js`. Do not lower a threshold to make a change pass.
- If a gate fails, compare against `main` on the same machine before concluding your change caused it. Local model runs vary.
- Put the before/after numbers for the gates you affected in the PR description.

## Changing the golden dataset

Edit `backend/evaluation/golden-dataset.json`. Every item must validate against `golden-dataset-schema.json`. Add items; do not delete failing ones to raise the score.

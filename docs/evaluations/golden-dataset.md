# Golden Dataset Curation

The Golden Dataset serves as the schema-validated ground-truth evaluation benchmark across all 10 EM domains.

---

## 📁 Repository Structure

- **Dataset File**: [`backend/evaluation/golden-dataset.json`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/golden-dataset.json)
- **JSON Schema**: [`backend/evaluation/golden-dataset-schema.json`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/golden-dataset-schema.json)

---

## 🧪 Ground Truth Item Schema

Each evaluation case defines:
- `id`: Unique test case identifier
- `query`: Exact user query prompt
- `expected_domains`: Array of required domain micro-agents (e.g. `["dora"]`, `["sprint", "roadmap"]`)
- `expected_tools`: Specific tool name that must be invoked
- `allow_rag`: Whether document retrieval is permissible
- `eval_criteria`: Semantic assertions for LLM-as-a-Judge validation

---

## ⚡ Multi-Agent Composite Benchmarks

| Eval ID | Query | Expected Domains | Expected Tools | Success Gate |
| :--- | :--- | :--- | :--- | :---: |
| `EVAL-COMP-001` | Full team health audit (DORA + Delivery + SBI) | `["dora", "delivery", "sbi"]` | `calculate_dora_metrics`, `analyze_delivery_bottlenecks`, `format_sbi_feedback` | $\text{Precision} \ge 1.0$ |
| `EVAL-COMP-002` | Sprint capacity, OKR pacing & roadmap drift | `["sprint", "okr", "roadmap"]` | `calculate_sprint_plan`, `evaluate_okr_progress`, `get_roadmap_alignment` | $\text{Precision} \ge 1.0$ |
| `EVAL-COMP-003` | Career progression & SOP governance review | `["people", "sop"]` | `analyze_personnel_growth`, `query_sop_compliance` | $\text{Precision} \ge 1.0$ |
| `EVAL-COMP-004` | Sprint retrospective & DORA throughput | `["retro", "dora"]` | `generate_sprint_retro`, `calculate_dora_metrics` | $\text{Precision} \ge 1.0$ |


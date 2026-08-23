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

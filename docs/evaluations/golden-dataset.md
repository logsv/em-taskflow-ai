# Golden Dataset Curation

The Golden Dataset serves as the schema-validated ground-truth evaluation benchmark across all 10 Engineering Manager (EM) domain micro-agents, Multi-Turn Session Fact-Matrix memory retention, Autonomous EM Health Audits, and zero-tool BFCL abstentions (**140 total benchmark items**).

---

## 📁 Repository Structure

- **Dataset File**: [`backend/evaluation/golden-dataset.json`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/golden-dataset.json)
- **JSON Schema**: [`backend/evaluation/golden-dataset-schema.json`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/golden-dataset-schema.json)
- **Evaluation Runner**: [`backend/evaluation/run-evaluation.js`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/run-evaluation.js)

---

## 📊 Benchmark Distribution (140 Items)

| Category | Item IDs | Items | Description |
| :--- | :--- | :---: | :--- |
| **DORA Metrics** | `EVAL-DORA-001` - `008` | 8 | MTTR, CFR, Deployment Freq, Lead Time, 30d/90d scorecard trends |
| **Delivery Bottlenecks** | `EVAL-DELIVERY-001` - `008` | 8 | PR review queue latency, WIP violations, stalled tickets, cycle time outliers |
| **SBI Feedback & Coaching** | `EVAL-SBI-001` - `008` | 8 | Situation-Behavior-Impact format, toxic adjective de-biasing, 1-on-1 talking scripts |
| **People & Competencies** | `EVAL-PEOPLE-001` - `008` | 8 | 12-dimension competency radar, L4 to L5 Senior / Staff promotion readiness, burnout |
| **Sprint Planning** | `EVAL-SPRINT-001` - `008` | 8 | Capacity estimation, story point velocity, 70/20/10 allocation, PTO deductions |
| **Sprint Retrospective** | `EVAL-RETRO-001` - `008` | 8 | Thematic clustering (*What Went Well*, *Friction*), SMART action items, Slack HITL |
| **Roadmap Alignment** | `EVAL-ROADMAP-001` - `008` | 8 | Milestone alignment, Jira Epic drift detection, cross-team initiative dependencies |
| **OKR Pacing** | `EVAL-OKR-001` - `008` | 8 | Quarterly OKR confidence scoring, pacing scores for p99 latency & test coverage |
| **SOP Governance** | `EVAL-SOP-001` - `008` | 8 | SOP governance, ADR compliance, review SLAs, escalation protocols |
| **Critic & Dossier Audit** | `EVAL-CRITIC-001` - `008` | 8 | Auditing draft EM promotion dossiers, performance review empathy checks, math audit |
| **Multi-Turn Context & Fact-Matrix** | `EVAL-CONTEXT-001` - `016` | 16 | Coreference resolution, Session Fact-Matrix recall, table condensation memory |
| **Autonomous Health Audit** | `EVAL-AUDIT-001` - `006` | 6 | 4-hour background cron harvest, Health Score ($20 \le \text{Score} \le 100$), Slack dispatch |
| **RAG Document & SOP Synthesis** | `EVAL-RAG-001` - `012` | 12 | PDF hybrid retrieval, Single-Pass structured markdown synthesis, HyDE expansion |
| **Fast-Path Zero-Tool Gates (BFCL)** | `EVAL-BFCL-001` - `012` | 12 | Zero-tool code gen, math, greetings, $<300\text{ms}$ SLA gate enforcement |
| **Guardrails & Provenance** | `EVAL-GUARD-001` - `006` | 6 | Refusing vanity LOC rankings, scrubbing toxic labels, offline MCP fallbacks |
| **Complex Cross-Domain Workflows** | `EVAL-COMP-001` - `008` | 8 | 3-way multi-agent orchestration (DORA + Delivery + SBI; Sprint + OKR + Roadmap) |

---

## 🧪 Ground Truth Item Schema

Each evaluation case defines:
- `eval_id`: Unique identifier (e.g. `EVAL-DORA-001`)
- `user_query`: Exact user query prompt
- `domain_category`: Primary classification category (`multi_agent`, `rag_sop`, `fast_path_edge`, `multi_turn_context`, `guardrails_provenance`, `autonomous_audit`)
- `expected_domains`: Array of required micro-agents (e.g. `["dora"]`, `["sprint", "okr", "roadmap"]`)
- `expected_tool_calls`: Specific tool names that must be invoked with 1-tool constraint
- `is_rag_appropriate`: Boolean indicating if document retrieval is expected
- `conversation_history`: Array of preceding turns for coreference & memory testing
- `expected_fact_matrix`: Optional assertion for Session Fact-Matrix scratchpad state
- `expected_slack_dispatch_mode`: Optional Slack dispatch mode (`consolidated`, `threaded_breakdown`, `action_nudge`)
- `success_criteria_gates`: Minimum SLA thresholds (e.g. `min_domain_precision: 1.0`, `max_latency_ms: 300`)


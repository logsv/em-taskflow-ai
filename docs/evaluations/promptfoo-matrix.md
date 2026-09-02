# Promptfoo Matrix Server & Cloud Evaluation

EM TaskFlow AI integrates with **Promptfoo** to evaluate prompt engineering variations, domain routing classification accuracy, security red-teaming, and LLM provider matrix sweeps across **32+ test assertions** with 100% local `hermes3:8b` inference.

---

## 🧪 Test Matrix Coverage (32+ Assertions)

The Promptfoo test matrix in [`backend/evaluation/promptfooconfig.yaml`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/evaluation/promptfooconfig.yaml) verifies:
- **10 Domain Micro-Agents**: Accurate classification for `dora`, `delivery`, `sbi`, `people`, `sprint`, `retro`, `roadmap`, `okr`, `sop`, `critic`.
- **Fast-Path Zero-Tool Gates**: Direct routing for pure Python code generation, algorithms, math, and conversational greetings without tool overhead.
- **Intent Disambiguation**:
  - Individual coaching vs. Sprint blockers $\rightarrow$ routes to `sbi`.
  - Career leveling rubrics vs. DORA throughput $\rightarrow$ routes to `people`.
  - Upcoming sprint capacity calculation vs. completed retro analysis $\rightarrow$ routes to `sprint` vs. `retro`.
  - Database migration SOPs vs. PR review bottlenecks $\rightarrow$ routes to `sop` vs. `delivery`.

---

## ⚡ Local Matrix Server (Port 15500)

Start the local standalone Promptfoo Matrix Server:
```bash
npm run eval:promptfoo:view
```
Open `http://localhost:15500` to inspect side-by-side prompt variations, latency distributions, and assertion pass rates.

---

## ☁️ Promptfoo Managed Cloud Synchronization

Sync prompt matrix benchmarks to the shared workspace:
```bash
# Login to Promptfoo Cloud
npm run eval:promptfoo:login

# Run and share evaluation
npm run eval:promptfoo
```
Workspace: `https://www.promptfoo.app` (Organization: `emtaskflow-ai`).


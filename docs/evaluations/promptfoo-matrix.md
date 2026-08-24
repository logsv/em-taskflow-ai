# Promptfoo Matrix Server & Cloud Evaluation

EM TaskFlow AI integrates with **Promptfoo** to evaluate prompt engineering variations, security red-teaming, and LLM provider matrix sweeps.

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

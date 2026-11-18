---
name: verify
description: Run this project's test gates and report real results. Use before saying any code change is done, before committing or pushing, and whenever the user asks to "run tests", "verify" or "check nothing broke". Picks backend (Jasmine), Python (pytest) and frontend (Vite build) suites based on what changed.
argument-hint: "[--all | backend | python | frontend]"
---

# Verify

## Run

```bash
bash scripts/verify.sh $ARGUMENTS
```

With no arguments the script compares against `origin/main` (plus uncommitted and untracked files) and runs only the affected suites:

| Changed path | Suite |
|---|---|
| `backend/**` | `cd backend && npm test` (Jasmine + nyc coverage thresholds) |
| `services/python-ai-service/**`, `proto/**` | `cd services/python-ai-service && uv run pytest -q` |
| `frontend/**` | `cd frontend && npm run build` |

Full logs go to `$TMPDIR/em-taskflow-verify/<suite>.log`.

## Report honestly

- Quote the actual summary line (e.g. `394 specs, 2 failures`). Never round, assume or reuse numbers from docs.
- For each failure, read the **full** log entry before diagnosing (AGENTS.md rule 1). Decide whether the failure is:
  1. **Caused by this change.** Fix it. Never skip, `xit`, comment out, or weaken the assertion.
  2. **Environmental.** Name the missing dependency. Known cases: `RAG Service processPDF` times out without the Python gRPC service on :50051; `TeamSyncWorker … lastRunStatus` needs PostgreSQL `taskflow_test` on :5432; `test_deepeval_agent_trajectories.py` needs Ollama (`hermes3:8b`) as the judge.
  3. **Pre-existing on `main`.** Confirm by running the same spec on a clean checkout (`git stash` only when you have no other in-flight edits) before claiming so.
- To iterate on one spec file: `cd backend && npx jasmine --config=jasmine.json test/path/to/file.spec.js`. Finish with the full run, because nyc coverage thresholds apply only to the full suite.

## Optional deeper gates (need Ollama running)

```bash
cd backend && npm run eval:multi-agent   # after router/prompt/agent changes
```

```bash
cd backend && npm run eval:rag           # after retrieval/chunking changes
```

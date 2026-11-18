---
name: sync-docs
description: Audit agent-facing docs (CLAUDE.md, AGENTS.md, GEMINI.md, SKILLS.md, .claude/skills/**, docs/**, README.md) against the actual code and fix drift. Use after a feature lands, before a release, when the user asks to update or check docs, or when you notice a doc reference that doesn't match the code.
disable-model-invocation: true
---

# Sync Docs With Code

Agents trust these files, so stale facts lead directly to wrong code. Fix every confirmed mismatch, and report anything you can't confirm.

## 1. Mechanical checks (run all)

```bash
# a) Backticked file names in agent docs that don't exist in the repo
for f in AGENTS.md CLAUDE.md .claude/skills/*/SKILL.md; do
  grep -oE '`[A-Za-z0-9_./-]+\.(js|jsx|mjs|py|sql|css|json|ya?ml|sh)`' "$f" | tr -d '`' | sort -u | while read -r p; do
    git ls-files | grep -q "$(basename "$p")$" || echo "$f: missing $p"
  done
done
```

```bash
# b) npm scripts referenced in docs that don't exist
grep -rhoE 'npm run [a-z:-]+' AGENTS.md CLAUDE.md README.md .claude/skills docs --include=*.md | sort -u
```
Compare each against `package.json`, `backend/package.json` and `frontend/package.json`.

```bash
# c) Hard-coded test counts (should not exist; the rule is "0 failures")
grep -rnE '[0-9]{2,4} (backend |python |unit )?(test )?specs' AGENTS.md CLAUDE.md GEMINI.md SKILLS.md .claude/skills docs .github --include=*.md --include=*.yml
```

```bash
# d) Machine-local links
grep -rn 'file:///' --include=*.md . | grep -v node_modules
```

```bash
# e) Domain list consistency (all should list the same 10 domains)
grep -n 'VALID_DOMAINS = new Set' -A2 backend/src/services/agentService.js
grep -n 'enum: \[' backend/src/agent/llmRouter.js
grep -n '"dora", "delivery"' backend/src/agent/graph.js
```

## 2. Semantic checks

For each `.claude/skills/*/SKILL.md` and each AGENTS.md section: spot-check 3–5 concrete claims (function names, endpoints under `/api/v1/*`, table names, TTLs, ports) against the code with grep. Pay most attention to claims that a mechanism exists, e.g. "Tier 2 tool cache". Confirm it is actually called on the execution path, not just defined.

## 3. Rules for edits

- `AGENTS.md` is the single source of truth for rules and architecture. `CLAUDE.md` and `GEMINI.md` import it and add only tool-specific notes. Don't copy content between them.
- Skill `description` fields must say **when** to use the skill (trigger conditions, paths), not just what the topic is.
- No test counts and no absolute paths.
- Commit doc fixes separately from code changes: `docs: sync <area> with code`.

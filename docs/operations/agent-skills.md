# 🧰 Agent Skills & Operational Playbooks

AI coding agents (Claude Code, Codex, Gemini CLI, Antigravity) working on EM TaskFlow AI follow a shared set of **skills**: Markdown playbooks that say where the code is, which rules apply, and how to verify a change.

- **Location**: [`.claude/skills/<name>/SKILL.md`](https://github.com/logsv/em-taskflow-ai/tree/main/.claude/skills). Claude Code discovers these automatically. `.agents/skills` is a symlink to the same folder for other agents.
- **Index**: [`SKILLS.md`](https://github.com/logsv/em-taskflow-ai/blob/main/SKILLS.md) lists every skill and when to use it.
- **Rules & architecture**: [`AGENTS.md`](https://github.com/logsv/em-taskflow-ai/blob/main/AGENTS.md) is the single source of truth. `CLAUDE.md` and `GEMINI.md` import it.

## Task skills

| Skill | Purpose |
| :--- | :--- |
| `/verify` | Runs `scripts/verify.sh`: backend Jasmine, Python pytest and the frontend build for whatever changed, and reports the real results. |
| `/add-micro-agent <domain>` | Checklist and template for a new EM domain agent, covering every file the domain name must be registered in. |
| `/add-mcp-tool <provider> <tool>` | Client facade → tool definition → registration → spec, for a new integration tool. |
| `/sync-docs` | Mechanical and semantic audit of agent docs against the code. |

## Area skills

`slm-routing-ops` · `domain-micro-agent-ops` · `mcp-integrations-ops` · `rag-pipeline-ops` · `multi-tier-caching-ops` · `db-per-service-ops` · `session-thread-management-ops` · `frontend-copilot-ui-ops` · `admin-portal-ops` · `autonomous-em-audit-ops` · `em-dora-productivity-ops` · `enterprise-evaluation-framework-ops` · `langfuse-analytics-migration` · `structured-json-logging-ops`

## Guardrails (Claude Code)

`.claude/settings.json` wires two project hooks:

- **`guard-bash.mjs`** (before every shell command) blocks wiping `app_settings` / `team_members`, dropping non-test databases, `docker compose down -v`, force-push and `--no-verify`.
- **`check-syntax.mjs`** (after every edit) runs `node --check`, `py_compile` and JSON parsing, so syntax errors surface immediately.

## Pre-push hook (everyone)

```bash
npm run hooks:install   # once per clone; sets core.hooksPath=scripts/git-hooks
```

Every `git push` then runs `scripts/verify.sh` for the areas your branch changed.

# 🤖 AI Agent Setup (Claude Code, Cursor, Codex, Copilot, Gemini)

Any team member can work on any service, often with an AI agent. This page explains how the repo keeps that work consistent and in scope.

## Files

| File | Read by | Purpose |
|---|---|---|
| `AGENTS.md` (root) | All agents | Project map, commands, task workflow, scope rules, project-wide hard rules |
| `backend/AGENTS.md`, `backend/src/agent/AGENTS.md`, `backend/src/mcp/AGENTS.md`, `services/python-ai-service/AGENTS.md`, `frontend/AGENTS.md` | All agents, when working in that folder | Local patterns and rules for that service |
| `CLAUDE.md` / `GEMINI.md` (root and per service) | Claude Code / Gemini CLI | One-line `@AGENTS.md` import. Do not add rules here |
| `.agents/skills/*/SKILL.md` | Codex, Cursor, Copilot; Claude Code via the `.claude/skills` symlink | Step-by-step workflows, loaded only when relevant |
| `.claude/settings.json` | Claude Code | Shared deny rules (secrets, force-push, `rm -rf`) |
| `CLAUDE.local.md`, `.claude/settings.local.json` | Claude Code | Personal preferences. Git-ignored |

## Skills

| Skill | Use when |
|---|---|
| `add-domain-agent` | Adding, renaming or removing a domain micro-agent, or changing routing |
| `add-mcp-integration` | Adding an external integration, tool, or OAuth flow |
| `db-schema-change` | Any table, column, index, new database, or data cleanup |
| `run-evaluations` | Changes to prompts, routing, agent tools, or RAG quality |

Add a new skill only for a long, repeated workflow that people keep getting wrong. One-line rules go in the relevant `AGENTS.md`.

## Workflow

1. The agent reads the ticket and code and writes a **scope note** (Goal, Not doing, `Scope:` paths, Assumptions/questions).
2. The developer approves it before any code is written.
3. The agent changes only the paths in scope; anything else goes under "Follow-ups" in the PR.
4. The PR description includes the scope note. CI checks the diff against the `Scope:` line.

## CI guardrails (`.github/workflows/pr-guardrails.yml`)

| Check | Fails when | Override label |
|---|---|---|
| Scope | A changed file is outside the PR's `Scope:` paths, or `Scope:` is missing | `scope-expanded` |
| Dependencies | A new npm package is added, or `pyproject.toml` / `requirements*.txt` changes | `deps-approved` |
| Tests | A test file is deleted, or `xit`/`fit`/`.skip`/`.only`/`pytest.mark.skip` is added | `tests-removed` (deletions only) |
| Size | More than 500 changed lines or 25 files (lockfiles excluded) | `large-pr` |
| High-risk paths | DB schema, OAuth, settings, CI, or agent files change with fewer than 2 approvals | none |

Labels are an explicit, visible decision, not a free pass: the reviewer checks the reason in the PR description.

## Keeping it current

When an agent makes the same mistake twice, add one line to the relevant `AGENTS.md` in a PR. Remove rules that are stale. Never put counts (tests, files) in these files.

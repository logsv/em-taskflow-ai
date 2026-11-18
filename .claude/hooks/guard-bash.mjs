#!/usr/bin/env node
// PreToolUse hook for Bash: blocks commands that violate AGENTS.md hard rules.
// Exit code 2 blocks the tool call and shows stderr to Claude.
import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // never break the session on malformed hook input
}

const cmd = String(input?.tool_input?.command || '');
// Ignore free text inside commit messages (`git commit -m "..."`), which may
// legitimately mention the very commands this guard blocks.
const lower = cmd
  .replace(/(?:-m|--message)(?:\s+|=)("(?:[^"\\]|\\.)*"|'[^']*'|\$'(?:[^'\\]|\\.)*')/g, '-m <msg>')
  .toLowerCase();

const rules = [
  {
    // Same statement, same line: `TRUNCATE [TABLE] app_settings`, `DROP TABLE [IF EXISTS] app_settings`, `DELETE FROM app_settings`.
    test: () => /\b(truncate|drop\s+table|delete\s+from)\b[^;\n]{0,40}\bapp_settings\b/.test(lower),
    why: 'AGENTS.md rule 6: app_settings holds live user credentials and model config — it must never be truncated, dropped or wiped.',
  },
  {
    test: () => /\b(truncate|drop\s+table|delete\s+from)\b[^;\n]{0,40}\bteam_members\b/.test(lower),
    why: 'AGENTS.md rule 6: real team_members profiles must never be deleted. Scope test cleanup to fixture rows, in a *_test database.',
  },
  {
    test: () => /\bdrop\s+database\b(?!\s+(if\s+exists\s+)?["']?\w+_(test|eval)\b)/.test(lower),
    why: 'Dropping a non-test database destroys per-service state. Only taskflow_test / taskflow_eval / taskflow_ai_test / taskflow_ai_eval may be dropped.',
  },
  {
    test: () => /docker[\s-]+compose\b.*\bdown\b.*(\s-v\b|--volumes)/.test(lower),
    why: '`docker compose down -v` deletes the PostgreSQL volumes (including app_settings credentials). Use `docker compose down` without -v, or ask the user first.',
  },
  {
    test: () => /\bgit\s+push\b.*(\s--force\b|\s-f\b)(?!-with-lease)/.test(lower),
    why: 'Force-push is not allowed from an agent session. Merge the remote branch instead, or ask the user.',
  },
  {
    test: () => /\bgit\s+push\b.*--no-verify\b/.test(lower),
    why: 'Bypassing the pre-push verification hook is not allowed. Fix the failing tests instead (AGENTS.md rule 4/5).',
  },
];

const hit = rules.find((r) => r.test());
if (hit) {
  process.stderr.write(`Blocked by .claude/hooks/guard-bash.mjs: ${hit.why}\nIf the user explicitly asked for this, tell them to run it themselves.\n`);
  process.exit(2);
}
process.exit(0);

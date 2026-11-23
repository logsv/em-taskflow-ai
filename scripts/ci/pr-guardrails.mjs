#!/usr/bin/env node
// PR guardrails: keeps AI-assisted (and human) PRs inside their declared scope.
// Usage: node scripts/ci/pr-guardrails.mjs [diff|approvals]
// Env: BASE_SHA, HEAD_SHA, PR_BODY, PR_LABELS (comma-separated)
//      approvals mode also needs GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER
// No dependencies; Node 20+.

import { execFileSync } from 'node:child_process';

const MAX_CHANGED_LINES = 500;
const MAX_CHANGED_FILES = 25;
const REQUIRED_APPROVALS_FOR_RISKY = 2;

const LABELS = {
  scope: 'scope-expanded',
  deps: 'deps-approved',
  testsRemoved: 'tests-removed',
  large: 'large-pr',
};

// Paths where a mistake is expensive: schema, auth, CI, agent instructions.
const RISKY_PATTERNS = [
  /^backend\/src\/db\//,
  /^docker\/postgres\//,
  /^services\/python-ai-service\/app\/services\/rag_processor\/database\.py$/,
  /^backend\/src\/mcp\/.*OAuth.*\.js$/,
  /^backend\/src\/services\/settingsService\.js$/,
  /^\.github\//,
  /^scripts\/ci\//,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /^GEMINI\.md$/,
  /^\.claude\//,
  /^\.agents\//,
];

const IGNORED_FOR_SIZE = [/package-lock\.json$/, /pnpm-lock\.yaml$/, /uv\.lock$/, /\.snap$/];
const TEST_FILE = /(^|\/)(test|tests|__tests__)\/|\.(spec|test)\.[jt]sx?$|(^|\/)test_[^/]+\.py$/;
const FOCUS_OR_SKIP = /\b(xit|xdescribe|fit|fdescribe)\s*\(|\.(skip|only)\s*\(|@pytest\.mark\.skip|\bpytest\.skip\s*\(/;
const ASSERTION = /\bexpect\s*\(|\bassert\b/;

const env = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const labels = new Set(
  env('PR_LABELS', '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean),
);

const errors = [];
const warnings = [];

function changedFiles(base, head) {
  return git('diff', '--name-status', '--no-renames', `${base}...${head}`)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status, path };
    });
}

export function parseScope(body) {
  const withoutComments = (body || '').replace(/<!--[\s\S]*?-->/g, '');
  const match = withoutComments.match(/^\s*Scope:[ \t]*(.*)$/im);
  if (!match) return [];
  return match[1]
    .split(/[,\s]+/)
    .map((p) => p.trim().replace(/^`|`$/g, '').replace(/^\.\//, ''))
    .filter(Boolean);
}

export function inScope(path, scopes) {
  return scopes.some((scope) => {
    if (scope.endsWith('/')) return path.startsWith(scope);
    return path === scope || path.startsWith(`${scope}/`);
  });
}

function checkScope(files, body) {
  const scopes = parseScope(body);
  if (scopes.length === 0) {
    errors.push('PR description has no `Scope:` line (e.g. `Scope: backend/src/mcp/, backend/test/mcp/`). See AGENTS.md.');
    return;
  }
  const outside = files.map((f) => f.path).filter((p) => !inScope(p, scopes));
  if (outside.length === 0) return;
  const list = outside.slice(0, 30).map((p) => `  - ${p}`).join('\n');
  const msg = `${outside.length} file(s) changed outside the declared Scope (${scopes.join(', ')}):\n${list}`;
  if (labels.has(LABELS.scope)) warnings.push(`${msg}\n  Allowed by the \`${LABELS.scope}\` label; the reviewer must check the reason.`);
  else errors.push(`${msg}\n  Remove these changes, widen Scope with a reason, or add the \`${LABELS.scope}\` label.`);
}

function readJsonAt(ref, path) {
  try {
    return JSON.parse(git('show', `${ref}:${path}`));
  } catch {
    return null;
  }
}

function checkDependencies(files, base, head) {
  const added = [];
  for (const { path, status } of files) {
    if (/(^|\/)package\.json$/.test(path)) {
      const before = status === 'A' ? {} : readJsonAt(base, path) || {};
      const after = status === 'D' ? {} : readJsonAt(head, path) || {};
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        const oldDeps = before[section] || {};
        for (const name of Object.keys(after[section] || {})) {
          if (!(name in oldDeps)) added.push(`${path}: ${name} (${section})`);
        }
      }
    } else if (/(^|\/)(pyproject\.toml|requirements[^/]*\.txt)$/.test(path)) {
      added.push(`${path}: changed (check for new Python packages)`);
    }
  }
  if (added.length === 0) return;
  const msg = `New or changed dependencies:\n${added.map((d) => `  - ${d}`).join('\n')}`;
  if (labels.has(LABELS.deps)) warnings.push(`${msg}\n  Allowed by the \`${LABELS.deps}\` label.`);
  else errors.push(`${msg}\n  AI agents often add unneeded or non-existent packages. Add the \`${LABELS.deps}\` label after a human has checked them.`);
}

function checkTests(files, base, head) {
  const deletedTests = files.filter((f) => f.status === 'D' && TEST_FILE.test(f.path)).map((f) => f.path);
  if (deletedTests.length > 0) {
    const msg = `Test files deleted:\n${deletedTests.map((p) => `  - ${p}`).join('\n')}`;
    if (labels.has(LABELS.testsRemoved)) warnings.push(`${msg}\n  Allowed by the \`${LABELS.testsRemoved}\` label.`);
    else errors.push(`${msg}\n  Add the \`${LABELS.testsRemoved}\` label only if the tested code was removed too.`);
  }

  for (const { path, status } of files) {
    if (status === 'D' || !TEST_FILE.test(path)) continue;
    const diff = git('diff', '--unified=0', `${base}...${head}`, '--', path).split('\n');
    const addedLines = diff.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    const removedLines = diff.filter((l) => l.startsWith('-') && !l.startsWith('---'));

    const focused = addedLines.filter((l) => FOCUS_OR_SKIP.test(l));
    if (focused.length > 0) {
      errors.push(`${path}: adds skipped or focused tests:\n${focused.map((l) => `  ${l.trim()}`).join('\n')}`);
    }

    const netAssertions = addedLines.filter((l) => ASSERTION.test(l)).length - removedLines.filter((l) => ASSERTION.test(l)).length;
    if (netAssertions < 0) {
      warnings.push(`${path}: ${-netAssertions} fewer assertion line(s) than before. Reviewer: confirm tests were not weakened.`);
    }
  }
}

function checkSize(base, head) {
  const rows = git('diff', '--numstat', '--no-renames', `${base}...${head}`)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [add, del, path] = line.split('\t');
      return { path, lines: (Number(add) || 0) + (Number(del) || 0) };
    })
    .filter((r) => !IGNORED_FOR_SIZE.some((re) => re.test(r.path)));
  const totalLines = rows.reduce((sum, r) => sum + r.lines, 0);
  if (totalLines <= MAX_CHANGED_LINES && rows.length <= MAX_CHANGED_FILES) return;
  const msg = `PR is large: ${totalLines} changed lines in ${rows.length} files (limits ${MAX_CHANGED_LINES} lines / ${MAX_CHANGED_FILES} files, lockfiles excluded).`;
  if (labels.has(LABELS.large)) warnings.push(`${msg}\n  Allowed by the \`${LABELS.large}\` label.`);
  else errors.push(`${msg}\n  Split it, or add the \`${LABELS.large}\` label and explain why it cannot be split.`);
}

async function checkApprovals(files) {
  const risky = files.map((f) => f.path).filter((p) => RISKY_PATTERNS.some((re) => re.test(p)));
  if (risky.length === 0) {
    console.log('No high-risk paths changed; normal review rules apply.');
    return;
  }
  const repo = env('GITHUB_REPOSITORY');
  const pr = env('PR_NUMBER');
  const token = env('GITHUB_TOKEN');
  const reviews = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}/reviews?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} while listing reviews`);
    const batch = await res.json();
    reviews.push(...batch);
    if (batch.length < 100) break;
  }
  // Latest decisive review per reviewer counts (APPROVED / CHANGES_REQUESTED / DISMISSED).
  const latest = new Map();
  for (const r of reviews) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)) latest.set(r.user.login, r.state);
  }
  const approvers = [...latest].filter(([, state]) => state === 'APPROVED').map(([login]) => login);
  const list = risky.map((p) => `  - ${p}`).join('\n');
  if (approvers.length >= REQUIRED_APPROVALS_FOR_RISKY) {
    console.log(`High-risk paths changed; approved by ${approvers.join(', ')}.\n${list}`);
  } else {
    errors.push(
      `High-risk paths changed; needs ${REQUIRED_APPROVALS_FOR_RISKY} approvals, has ${approvers.length}.\n${list}\n` +
        '  This check re-runs automatically when a review is submitted.',
    );
  }
}

async function main() {
  const mode = process.argv[2] || 'diff';
  const base = env('BASE_SHA');
  const head = env('HEAD_SHA');
  const files = changedFiles(base, head);

  if (mode === 'diff') {
    checkScope(files, env('PR_BODY', ''));
    checkDependencies(files, base, head);
    checkTests(files, base, head);
    checkSize(base, head);
  } else if (mode === 'approvals') {
    await checkApprovals(files);
  } else {
    throw new Error(`Unknown mode "${mode}" (use diff or approvals)`);
  }

  for (const w of warnings) console.log(`::warning::${w.split('\n')[0]}\n${w}\n`);
  for (const e of errors) console.log(`::error::${e.split('\n')[0]}\n${e}\n`);
  if (errors.length > 0) {
    console.log(`${errors.length} guardrail check(s) failed. See AGENTS.md for the rules.`);
    process.exit(1);
  }
  console.log(`All ${mode} guardrails passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error(`::error::pr-guardrails crashed: ${err.message}`);
    process.exit(1);
  });
}

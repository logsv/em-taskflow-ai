#!/usr/bin/env node
// PostToolUse hook for Edit/Write: fast syntax check of the edited file so broken
// code is caught immediately instead of at test time. Exit 2 feeds stderr back to Claude.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path || input?.tool_response?.filePath;
if (!file || !existsSync(file) || file.includes('/node_modules/')) process.exit(0);

let check = null;
if (/\.(m?js|cjs)$/.test(file)) check = ['node', ['--check', file]];
else if (/\.py$/.test(file)) check = ['python3', ['-m', 'py_compile', file]];
else if (/\.json$/.test(file)) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`Invalid JSON in ${file}: ${err.message}\n`);
    process.exit(2);
  }
  process.exit(0);
}
if (!check) process.exit(0);

const res = spawnSync(check[0], check[1], { encoding: 'utf8', timeout: 20000 });
if (res.error) process.exit(0); // interpreter missing: don't block
if (res.status !== 0) {
  process.stderr.write(`Syntax check failed for ${file}:\n${(res.stderr || res.stdout || '').trim()}\n`);
  process.exit(2);
}
process.exit(0);

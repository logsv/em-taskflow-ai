/**
 * Regression: zod's z.coerce.boolean() turned the string "false" into true, so setting
 * LLM_OPENAI_ENABLED=false (or any LEGACY_*_ENABLED=false) silently enabled it.
 * config.js is evaluated at import time, so each case runs in a fresh Node process.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadConfigWith(env) {
  const script = "import('./src/config.js').then(({ config: c }) => process.stdout.write(JSON.stringify({ openai: c.llm.providers.openai.enabled, ollama: c.llm.providers.ollama.enabled, legacyQuery: c.api.legacy.query.enabled, ragAdvanced: c.ragAdvanced.enabled, githubOwner: c.mcp.github.owner || null })))";
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: backendRoot,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out.slice(out.indexOf('{')));
}

describe('config boolean parsing', () => {
  it('treats the string "false" as false', () => {
    const c = loadConfigWith({ LLM_OPENAI_ENABLED: 'false', LLM_OLLAMA_ENABLED: 'false', LEGACY_QUERY_API_ENABLED: 'false', RAG_ADVANCED_ENABLED: 'false' });
    expect(c).toEqual(jasmine.objectContaining({ openai: false, ollama: false, legacyQuery: false, ragAdvanced: false }));
  });

  it('treats "true"/"1"/"yes" as true', () => {
    expect(loadConfigWith({ LLM_OPENAI_ENABLED: 'true' }).openai).toBeTrue();
    expect(loadConfigWith({ LLM_OPENAI_ENABLED: '1' }).openai).toBeTrue();
    expect(loadConfigWith({ LLM_OPENAI_ENABLED: 'yes' }).openai).toBeTrue();
  });

  it('keeps defaults when unset', () => {
    const c = loadConfigWith({});
    expect(c.openai).toBeFalse();
    expect(c.ollama).toBeTrue();
  });

  it('rejects unrecognised boolean values at startup instead of guessing', () => {
    expect(() => loadConfigWith({ LLM_OPENAI_ENABLED: 'maybe' })).toThrow();
  });

  it('keeps GITHUB_OWNER (it used to be stripped by the schema)', () => {
    expect(loadConfigWith({ GITHUB_OWNER: 'acme' }).githubOwner).toBe('acme');
  });
});

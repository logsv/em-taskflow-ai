/**
 * Readiness: checks each dependency for real and reports per-dependency status.
 * Required dependencies (database, local model) decide the overall HTTP status;
 * optional ones are reported but do not fail readiness.
 */
import databaseService from '../../db/postgres.js';
import { getLlmConfig } from '../../config.js';
import { resolveOllamaBaseUrl } from '../../llm/index.js';
import { isSemanticCacheRedisConnected } from '../../cache/semanticCache.js';
import { setGauge } from '../../core/metrics.js';

const TIMEOUT_MS = 2500;

async function timed(fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    return { status: 'ok', latencyMs: Date.now() - started, ...(detail || {}) };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - started, error: err?.message || String(err) };
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function checkDatabase(db = databaseService) {
  return timed(async () => {
    await db.ensureInitialized();
    await db.pool.query('SELECT 1');
  });
}

/** Ollama reachable AND the configured chat + embedding models are installed. */
export async function checkModel(llmConfig = getLlmConfig(), fetchImpl = fetchJson) {
  return timed(async () => {
    const provider = llmConfig.defaultProvider || 'ollama';
    if (provider !== 'ollama') return { provider, model: llmConfig.defaultModel, note: 'non-Ollama provider: not probed' };
    const base = resolveOllamaBaseUrl(llmConfig.providers?.ollama?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    const tags = await fetchImpl(`${base}/api/tags`);
    const installed = (tags.models || []).map((m) => m.name || m.model).filter(Boolean);
    const normalise = (n) => (n.includes(':') ? n : `${n}:latest`);
    const wanted = normalise(llmConfig.defaultModel);
    if (!installed.map(normalise).includes(wanted)) {
      throw new Error(`Model ${llmConfig.defaultModel} is not installed in Ollama (run scripts/setup-ollama-models.sh)`);
    }
    return { model: llmConfig.defaultModel, installedModels: installed.length };
  });
}

export async function checkPythonService(fetchImpl = fetchJson) {
  const base = (process.env.PYTHON_AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
  return timed(async () => {
    await fetchImpl(`${base}/health`);
  });
}

export async function checkRedis() {
  return isSemanticCacheRedisConnected()
    ? { status: 'ok' }
    : { status: 'degraded', error: 'Semantic cache is using the in-memory fallback (Redis not connected)' };
}

export async function getReadiness(checks = {}) {
  const [database, model, pythonService, redis] = await Promise.all([
    (checks.database || checkDatabase)(),
    (checks.model || checkModel)(),
    (checks.pythonService || checkPythonService)(),
    (checks.redis || checkRedis)(),
  ]);
  const dependencies = { database, model, pythonService, redis };
  const required = ['database', 'model'];
  const ready = required.every((k) => dependencies[k].status === 'ok');
  Object.entries(dependencies).forEach(([name, d]) => setGauge('dependency_up', d.status === 'ok' ? 1 : 0, { dependency: name }, 'Dependency health (1 = ok)'));
  return {
    ready,
    status: ready ? (Object.values(dependencies).every((d) => d.status === 'ok') ? 'ok' : 'degraded') : 'not_ready',
    required,
    dependencies,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Minimal in-process metrics registry (counters + gauges) with Prometheus text output.
 * Exposed at GET /api/v1/metrics. Single-process by design (single-owner deployment).
 */

const counters = new Map(); // name -> { help, values: Map<labelKey, number> }
const gauges = new Map();

function labelKey(labels = {}) {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${String(labels[k])}`).join(',');
}

function ensure(map, name, help) {
  if (!map.has(name)) map.set(name, { help: help || name, values: new Map() });
  return map.get(name);
}

/** Increment a counter, e.g. incCounter('fallback_total', { capability: 'dora', reason: 'mcp_timeout' }). */
export function incCounter(name, labels = {}, by = 1, help = '') {
  const metric = ensure(counters, name, help);
  const key = labelKey(labels);
  metric.values.set(key, (metric.values.get(key) || 0) + by);
}

export function setGauge(name, value, labels = {}, help = '') {
  ensure(gauges, name, help).values.set(labelKey(labels), Number(value));
}

export function getCounter(name, labels = {}) {
  return counters.get(name)?.values.get(labelKey(labels)) || 0;
}

/** Snapshot for JSON consumers (tests, admin UI). */
export function snapshotMetrics() {
  const out = {};
  for (const [name, m] of [...counters, ...gauges]) {
    out[name] = Object.fromEntries(m.values);
  }
  return out;
}

export function resetMetrics() {
  counters.clear();
  gauges.clear();
}

function renderLabels(key) {
  if (!key) return '';
  const parts = key.split(',').map((pair) => {
    const idx = pair.indexOf('=');
    const k = pair.slice(0, idx);
    const v = pair.slice(idx + 1).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `${k}="${v}"`;
  });
  return `{${parts.join(',')}}`;
}

/** Prometheus text exposition format. */
export function renderPrometheus() {
  const lines = [];
  for (const [type, map] of [['counter', counters], ['gauge', gauges]]) {
    for (const [name, m] of map) {
      lines.push(`# HELP ${name} ${m.help}`);
      lines.push(`# TYPE ${name} ${type}`);
      for (const [key, value] of m.values) lines.push(`${name}${renderLabels(key)} ${value}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Capability pipeline: Plan (router domains) → Execute (capability tools, in parallel) →
 * Verify (every requested domain ran and returned data) → Compose (deterministic, from tool
 * summaries only: no LLM rewrites numbers on this path).
 *
 * Nothing is silently dropped: a tool that failed or returned no data is listed in the answer
 * with its reason, and when nothing succeeded the pipeline abstains instead of guessing.
 */
import { resolveDomains } from '../capabilities/registry.js';
import { detectTarget, isListQuery } from '../capabilities/targets.js';
import { resolveTimeWindow, timeWindowNote } from '../capabilities/timeWindow.js';
import { incCounter } from '../core/metrics.js';
import { classifyError } from '../core/errors.js';
import { warn } from '../utils/logger.js';

export const DEFAULT_TOOL_TIMEOUT_MS = 90_000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { name: 'TimeoutError' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Execute the capability tools for the planned domains.
 * @returns {Promise<Array<{capabilityId, capabilityTitle, domain, toolName, status, data, provenance, outcome, error, durationMs}>>}
 */
export async function executeCapabilities(query, domains, ctx = {}) {
  const planned = resolveDomains(domains);
  const mode = isListQuery(query) ? 'LIST_RAW' : null;
  const target = detectTarget(query);
  const timeoutMs = ctx.toolTimeoutMs || DEFAULT_TOOL_TIMEOUT_MS;
  const timeWindow = ctx.timeWindow === undefined ? resolveTimeWindow(query) : ctx.timeWindow;

  return Promise.all(planned.map(async (p) => {
    const started = Date.now();
    const base = { capabilityId: p.capabilityId, capabilityTitle: p.capabilityTitle, domain: p.domain, toolName: p.tool.name };
    try {
      const input = (await p.input?.(query, ctx)) || {};
      const args = {
        target,
        fetch_fresh_data: true,
        ...(timeWindow && acceptsTimeWindow(p.tool) ? { time_window: timeWindow.window } : {}),
        ...input,
        ...(mode ? { mode } : {}),
      };
      const result = await withTimeout(Promise.resolve(p.tool.invoke(args)), timeoutMs, p.tool.name);
      const status = result?.status || 'UNKNOWN';
      incCounter('capability_runs_total', { capability: p.capabilityId, domain: p.domain, status }, 1, 'Capability tool runs by status');
      return {
        ...base,
        status,
        data: result?.data || null,
        provenance: Array.isArray(result?.provenance) ? result.provenance : [],
        outcome: result?.outcome || null,
        staleData: !!result?.staleDataWarning,
        timeWindow: args.time_window || null,
        error: status === 'SUCCESS' ? null : (result?.error || result?.data?.message || null),
        durationMs: Date.now() - started,
      };
    } catch (err) {
      const code = err?.name === 'TimeoutError' ? 'TOOL_TIMEOUT' : classifyError(err).code;
      incCounter('capability_runs_total', { capability: p.capabilityId, domain: p.domain, status: 'FAILED' }, 1, 'Capability tool runs by status');
      warn({ module: 'capabilityPipeline', tool: p.tool.name, code, err: err?.message }, 'Capability tool failed');
      return { ...base, status: 'FAILED', data: null, provenance: [], outcome: null, staleData: false, error: `${code}: ${err?.message || 'failed'}`, durationMs: Date.now() - started };
    }
  }));
}

/** True when the tool's input schema has a `time_window` field (zod object shape). */
export function acceptsTimeWindow(tool) {
  const shape = tool?.schema?.shape || tool?.schema?._def?.shape?.();
  return !!shape && Object.prototype.hasOwnProperty.call(shape, 'time_window');
}

/** A run counts as grounded when it succeeded and produced something to show. */
function isUsable(run) {
  return run.status === 'SUCCESS' && !!(run.data?.summary || run.domain === 'sprint');
}

/** Check the runs against the plan. */
export function verifyRuns(runs, requestedDomains = []) {
  const ran = new Set(runs.map((r) => r.domain));
  const usable = runs.filter(isUsable);
  const failed = runs.filter((r) => !isUsable(r));
  const capabilityRequested = resolveDomains(requestedDomains).map((p) => p.domain);
  const missingDomains = capabilityRequested.filter((d) => !ran.has(d));
  return {
    grounded: usable.length > 0,
    complete: failed.length === 0 && missingDomains.length === 0,
    usableDomains: usable.map((r) => r.domain),
    failed: failed.map((r) => ({ domain: r.domain, tool: r.toolName, status: r.status, error: r.error })),
    missingDomains,
    staleDomains: runs.filter((r) => r.staleData).map((r) => r.domain),
  };
}

function sprintFallbackSummary(data = {}) {
  const m = data.capacity_metrics || {};
  const v = (x) => (x === null || x === undefined ? 'unavailable' : x);
  return `Sprint capacity: ${v(m.team_capacity_hours)} hours; target velocity: ${v(m.target_velocity_points)} points; recommended commitment: ${v(m.recommended_commitment_points)} points.`;
}

/** Deterministic answer from tool summaries, with failures listed, or an abstention. */
export function composeAnswer(runs, verification, notes = []) {
  const parts = runs.filter(isUsable).map((r) => r.data?.summary || sprintFallbackSummary(r.data));
  if (parts.length > 0) for (const n of notes.filter(Boolean)) parts.unshift(`> ${n}`);
  if (verification.failed.length > 0) {
    const lines = verification.failed.map((f) => `- **${f.domain}** (${f.tool}): ${f.status}${f.error ? ` (${String(f.error).slice(0, 160)})` : ''}`);
    const heading = parts.length > 0 ? '#### Not included: these sources returned no usable data' : '#### I could not get data for this request';
    parts.push(`${heading}\n${lines.join('\n')}\n\nCheck the integration in Admin, Settings, then ask again. Nothing above was estimated to fill the gap.`);
  }
  if (verification.staleDomains.length > 0) {
    parts.push(`> Some figures come from the last stored snapshot because the live source was unavailable: ${verification.staleDomains.join(', ')}.`);
  }
  return parts.join('\n\n');
}

/**
 * Run the full pipeline for the capability domains of a routing plan.
 * Returns null when the plan contains no capability domain (the caller handles RAG / direct / integrations).
 * Mutates `decision` with toolsUsed, provenance, capabilities and verification.
 */
export async function runCapabilityPipeline(query, routingPlan, decision, ctx = {}) {
  const domains = Array.isArray(routingPlan?.domains) ? routingPlan.domains : [];
  if (resolveDomains(domains).length === 0) return null;

  const timeWindow = ctx.timeWindow === undefined ? resolveTimeWindow(query) : ctx.timeWindow;
  const runs = await executeCapabilities(query, domains, { ...ctx, timeWindow });
  const verification = verifyRuns(runs, domains);
  const usedWindow = timeWindow && runs.some((r) => r.timeWindow);
  if (usedWindow) decision.timeWindow = { requested: timeWindow.phrase, days: timeWindow.days, measured: timeWindow.window, exact: timeWindow.exact };

  decision.toolsUsed = Array.from(new Set([...(decision.toolsUsed || []), ...runs.map((r) => r.toolName)]));
  decision.provenance = [...(decision.provenance || []), ...runs.flatMap((r) => r.provenance.map((p) => ({ ...p, domain: r.domain })))];
  decision.capabilities = Array.from(new Set(runs.map((r) => r.capabilityId)));
  decision.verification = verification;
  decision.selectedPath = verification.grounded ? 'capability-pipeline' : 'capability-pipeline-abstained';
  for (const f of verification.failed) decision.reasons.push(`capability_tool_${f.status.toLowerCase()}:${f.tool}`);
  incCounter('capability_pipeline_total', { outcome: verification.grounded ? (verification.complete ? 'complete' : 'partial') : 'abstained' }, 1, 'Capability pipeline answers by outcome');

  return { answer: composeAnswer(runs, verification, [usedWindow ? timeWindowNote(timeWindow) : null]), sources: [], runs, verification };
}

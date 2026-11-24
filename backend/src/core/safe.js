/**
 * Visible failure handling. Use these instead of empty catch blocks or `.catch(() => {})`:
 * the failure is still handled, but it is logged and counted, so outages and contract
 * breaks show up in logs and in /api/v1/metrics.
 *
 *   const rows = await db.getRows().catch(swallow('agent.dora.snapshots', []));
 *   background('chat.shadowEval', () => sendShadowEval(...));
 */
import { warn } from '../utils/logger.js';
import { incCounter } from './metrics.js';

/**
 * Returns a catch handler that logs + counts the error and resolves to `fallback`.
 * @template T
 * @param {string} context dotted site name, e.g. 'agent.sprint.analytics'
 * @param {T} [fallback]
 * @returns {(err: unknown) => T}
 */
export function swallow(context, fallback = undefined) {
  return (err) => {
    incCounter('handled_errors_total', { context }, 1, 'Errors handled with a fallback value');
    warn({ module: 'safe', action: 'swallow', context, err: err?.message || String(err) }, `Handled error in ${context}`);
    return fallback;
  };
}

/** Record a handled error from a try/catch block (same as swallow, without returning). */
export function recordHandledError(context, err) {
  swallow(context)(err);
}

/**
 * Run a fire-and-forget task after the current tick. It never throws into the caller, but a
 * failure is logged and counted.
 * @param {string} name
 * @param {() => unknown | Promise<unknown>} fn
 */
export function background(name, fn) {
  setImmediate(async () => {
    try {
      await fn();
      incCounter('background_tasks_total', { name, outcome: 'ok' }, 1, 'Background tasks run');
    } catch (err) {
      incCounter('background_tasks_total', { name, outcome: 'failed' }, 1, 'Background tasks run');
      warn({ module: 'safe', action: 'background', name, err: err?.message || String(err) }, `Background task ${name} failed`);
    }
  });
}

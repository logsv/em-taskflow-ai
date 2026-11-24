/**
 * Shared result and evidence shapes (JSDoc typedefs backed by zod schemas, validated at the
 * boundaries that produce them).
 */
import { z } from 'zod';

/**
 * Where one piece of data came from and how fresh it is.
 * @typedef {Object} Provenance
 * @property {string} source        e.g. 'github', 'jira', 'googleCalendar', 'default'
 * @property {'live'|'snapshot'|'none'} mode
 * @property {string|null} asOf     ISO timestamp the data was fetched/synced, if known
 * @property {string|null} [dataSource]       raw data_source label from the tool
 * @property {string|null} [dataAvailability] why data is missing, when it is
 * @property {string} [domain]      capability that used it (set by the orchestrator)
 */
export const ProvenanceSchema = z.object({
  source: z.string(),
  mode: z.enum(['live', 'snapshot', 'none']),
  asOf: z.string().nullable(),
  dataSource: z.string().nullable().optional(),
  dataAvailability: z.string().nullable().optional(),
  domain: z.string().optional(),
});

/**
 * Outcome of a tool/capability run.
 * ok: all sources live · degraded: some data from snapshots or missing · failed: no usable result.
 * @typedef {'ok'|'degraded'|'failed'} Outcome
 */
export const OutcomeSchema = z.enum(['ok', 'degraded', 'failed']);

/**
 * One piece of evidence an answer may cite ([E1] tool data, [D3] document chunk).
 * @typedef {Object} Evidence
 * @property {string} id
 * @property {'metric'|'record'|'doc_chunk'} kind
 * @property {string} source
 * @property {string} title
 * @property {string} [url]
 * @property {number} [value]
 * @property {string} [unit]
 * @property {string} [text]
 * @property {string|null} asOf
 * @property {'live'|'snapshot'|'indexed'} mode
 * @property {number} [score]
 */
export const EvidenceSchema = z.object({
  id: z.string().regex(/^[ED]\d+$/),
  kind: z.enum(['metric', 'record', 'doc_chunk']),
  source: z.string(),
  title: z.string(),
  url: z.string().url().optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  text: z.string().optional(),
  asOf: z.string().nullable(),
  mode: z.enum(['live', 'snapshot', 'indexed']),
  score: z.number().optional(),
});

const SNAPSHOT_TIER = 'TIER_3_DB_CACHE';

/**
 * Build provenance for one harness source from its tier and returned data.
 * @returns {Provenance}
 */
export function provenanceFor(source, tierUsed, data) {
  const d = data && typeof data === 'object' ? data : {};
  const availability = d.data_availability || null;
  const empty = !data || d.data_source === 'none' || d.data_source === 'empty' || (availability && availability !== 'ok');
  let mode = 'live';
  if (tierUsed === SNAPSHOT_TIER) mode = empty ? 'none' : 'snapshot';
  else if (tierUsed === 'NONE' || !data) mode = 'none';
  return {
    source,
    mode,
    asOf: d.synced_at || d.syncedAt || null,
    dataSource: d.data_source || d.source || null,
    dataAvailability: availability,
  };
}

/** Overall outcome from per-source provenance. */
export function outcomeFrom(provenance = [], computeFailed = false) {
  if (computeFailed) return 'failed';
  if (provenance.length === 0) return 'failed';
  if (provenance.every((p) => p.mode === 'none')) return 'degraded';
  return provenance.every((p) => p.mode === 'live') ? 'ok' : 'degraded';
}

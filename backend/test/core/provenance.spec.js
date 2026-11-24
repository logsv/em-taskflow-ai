import { createDeterministicToolHarness } from '../../src/mcp/baseToolHarness.js';
import { provenanceFor, outcomeFrom, ProvenanceSchema } from '../../src/core/types.js';

function harness({ live = null, snapshot = {}, computeThrows = false } = {}) {
  return createDeterministicToolHarness({
    name: 'test_tool',
    description: 'test',
    mcpExecutors: { github: async () => live },
    dbCacheFallback: async () => snapshot,
    computeMath: async (results) => {
      if (computeThrows) throw new Error('math broke');
      return { summary: 'ok', results };
    },
  });
}

describe('Tool provenance and outcome', () => {
  it('reports ok + live when the live source answers', async () => {
    const res = await harness({ live: { value: 1, synced_at: '2026-11-24T10:00:00Z' } }).invoke({ sources: ['github'] });
    expect(res.outcome).toBe('ok');
    expect(res.provenance).toEqual([jasmine.objectContaining({ source: 'github', mode: 'live', asOf: '2026-11-24T10:00:00Z' })]);
    res.provenance.forEach((p) => expect(ProvenanceSchema.safeParse(p).success).toBeTrue());
  });

  it('reports degraded + snapshot when it falls back to the database', async () => {
    const res = await harness({ live: null, snapshot: { value: 2, synced_at: '2026-11-20T08:00:00Z', data_source: 'postgres_x' } }).invoke({ sources: ['github'] });
    expect(res.outcome).toBe('degraded');
    expect(res.provenance[0]).toEqual(jasmine.objectContaining({ mode: 'snapshot', asOf: '2026-11-20T08:00:00Z' }));
    expect(res.staleDataWarning).toBeTrue();
  });

  it('reports mode none when the fallback has no data', async () => {
    const res = await harness({ live: null, snapshot: { data_source: 'none', data_availability: 'no_data' } }).invoke({ sources: ['github'] });
    expect(res.provenance[0].mode).toBe('none');
    expect(res.provenance[0].dataAvailability).toBe('no_data');
    expect(res.outcome).toBe('degraded');
  });

  it('reports failed (not SUCCESS) when the computation throws', async () => {
    const res = await harness({ live: { value: 1 }, computeThrows: true }).invoke({ sources: ['github'] });
    expect(res.status).toBe('FAILED');
    expect(res.outcome).toBe('failed');
  });

  it('outcomeFrom covers mixed sources', () => {
    expect(outcomeFrom([{ mode: 'live' }, { mode: 'snapshot' }])).toBe('degraded');
    expect(outcomeFrom([])).toBe('failed');
    expect(provenanceFor('x', 'TIER_1_MCP', null).mode).toBe('none');
  });
});

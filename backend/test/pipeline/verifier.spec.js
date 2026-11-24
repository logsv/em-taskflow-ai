import { extractFigures, verifyFigures, applyFigureCheck } from '../../src/pipeline/verifier.js';
import { getCounter, resetMetrics } from '../../src/core/metrics.js';

describe('Free-text verifier', () => {
  beforeEach(() => resetMetrics());

  it('extracts figures but not list markers or bare single digits', () => {
    const f = extractFigures('1. Lead time is 18.5h\n2. CFR 4.2% across 1,250 deploys and 3 teams');
    expect(f.map((x) => x.n)).toEqual(['18.5', '4.2', '1250']);
  });

  it('accepts figures present in the evidence or the question, in any formatting', () => {
    const r = verifyFigures('Coverage is 85% on 1,200 tests (target 90).', ['coverage: 85.0 % of 1200 tests'], { query: 'is coverage above 90?' });
    expect(r.supported).toBeTrue();
  });

  it('flags a figure the sources do not contain and says so in the answer', () => {
    const decision = { reasons: [] };
    const out = applyFigureCheck('rag', 'The SLA is 99.99% with 4h response.', ['The SLA is 99.9% availability.'], decision);
    expect(decision.verification.figures.unsupported).toEqual(['99.99%']);
    expect(out).toContain('Unverified figures');
    expect(out).toContain('99.99%');
    expect(getCounter('verifier_answers_total', { kind: 'rag', outcome: 'unsupported_figures' })).toBe(1);
  });

  it('marks an answer unverified when there was no evidence to check it against', () => {
    const out = applyFigureCheck('integration', 'You have 12 open tickets.', [], { reasons: [] });
    expect(out).toContain('no source text was returned');
  });

  it('leaves a supported answer unchanged', () => {
    const answer = 'There are 12 open tickets.';
    expect(applyFigureCheck('integration', answer, ['{"total":12}'], { reasons: [] })).toBe(answer);
  });
});

import express from 'express';
import supertest from 'supertest';
import adminRouter, { buildEvalMetrics } from '../../src/routes/admin.js';

describe('Admin eval metrics (Zero Misleading Fallbacks)', () => {
  describe('buildEvalMetrics', () => {
    it('returns null for every metric when no reports exist', () => {
      const m = buildEvalMetrics(null, null);
      expect(m.domainAccuracyPct).toBeNull();
      expect(m.toolGroundedPct).toBeNull();
      expect(m.unwantedRagPct).toBeNull();
      expect(m.ragasFaithfulness).toBeNull();
      expect(m.ragasAnswerRelevancy).toBeNull();
      expect(m.ragasContextPrecision).toBeNull();
      expect(m.ragasContextRecall).toBeNull();
      expect(m.deepevalSbiQualityScore).toBeNull();
      expect(m.deepevalToolAdherenceScore).toBeNull();
      expect(m.fastPathAvgLatencyMs).toBeNull();
      expect(m.fastPathSamples).toBeNull();
      expect(m.ragSamples).toBeNull();
      expect(m.shadowSamplingRatePct).toBeNull();
      expect(m.lastBenchmarkTimestamp).toBeNull();
      expect(m.lastBenchmarkDuration).toBeNull();
    });

    it('keeps null when the composite report says the metric was not measured', () => {
      const m = buildEvalMetrics(null, {
        fast_path_latency_ms: null,
        fast_path_samples: 0,
        rag_faithfulness: null,
        rag_samples: 0,
      });
      expect(m.fastPathAvgLatencyMs).toBeNull();
      expect(m.ragasFaithfulness).toBeNull();
      expect(m.fastPathSamples).toBe(0);
      expect(m.ragSamples).toBe(0);
    });

    it('ignores a stale numeric value when its sample count is zero', () => {
      const m = buildEvalMetrics(null, {
        fast_path_latency_ms: 185,
        fast_path_samples: 0,
        rag_faithfulness: 0.95,
        rag_samples: 0,
      });
      expect(m.fastPathAvgLatencyMs).toBeNull();
      expect(m.ragasFaithfulness).toBeNull();
    });

    it('passes measured values through unchanged, including zero', () => {
      const m = buildEvalMetrics(null, {
        timestamp: '2026-11-19T00:00:00.000Z',
        domain_selection_accuracy: 0.875,
        tool_grounded_rate: 0,
        unwanted_rag_rate: 0.04,
        fast_path_latency_ms: 142,
        fast_path_samples: 6,
        rag_faithfulness: 0.81,
        rag_samples: 4,
      });
      expect(m.domainAccuracyPct).toBe(88);
      expect(m.toolGroundedPct).toBe(0);
      expect(m.unwantedRagPct).toBe(4);
      expect(m.fastPathAvgLatencyMs).toBe(142);
      expect(m.ragasFaithfulness).toBe(0.81);
      expect(m.lastBenchmarkTimestamp).toBe('2026-11-19T00:00:00.000Z');
    });

    it('accepts older composite reports without sample counts', () => {
      const m = buildEvalMetrics(null, { fast_path_latency_ms: 210, rag_faithfulness: 0.9 });
      expect(m.fastPathAvgLatencyMs).toBe(210);
      expect(m.ragasFaithfulness).toBe(0.9);
    });

    it('prefers Ragas benchmark scores and leaves missing ones null', () => {
      const m = buildEvalMetrics(
        { timestamp: 't1', duration_seconds: 12.5, ragas_metrics: { faithfulness: 0.77, context_recall: 0.66 } },
        { rag_faithfulness: 0.9, rag_samples: 3 },
      );
      expect(m.ragasFaithfulness).toBe(0.77);
      expect(m.ragasContextRecall).toBe(0.66);
      expect(m.ragasAnswerRelevancy).toBeNull();
      expect(m.ragasContextPrecision).toBeNull();
      expect(m.lastBenchmarkTimestamp).toBe('t1');
      expect(m.lastBenchmarkDuration).toBe(12.5);
    });

    it('treats non-numeric values as not measured', () => {
      const m = buildEvalMetrics({ ragas_metrics: { faithfulness: 'NaN' } }, { fast_path_latency_ms: '185', domain_selection_accuracy: NaN });
      expect(m.ragasFaithfulness).toBeNull();
      expect(m.fastPathAvgLatencyMs).toBeNull();
      expect(m.domainAccuracyPct).toBeNull();
    });
  });

  describe('GET /api/admin/eval/metrics', () => {
    it('never reports the old hardcoded defaults', async () => {
      const app = express();
      app.use('/api/admin', adminRouter);
      const res = await supertest(app).get('/api/admin/eval/metrics').expect(200);

      expect(res.body.success).toBe(true);
      const m = res.body.metrics;
      expect(m.fastPathAvgLatencyMs).not.toBe(185);
      expect(m.ragasFaithfulness).not.toBe(0.965);
      expect(m.ragasAnswerRelevancy).not.toBe(0.892);
      expect(m.deepevalSbiQualityScore).toBeNull();
      expect(m.deepevalToolAdherenceScore).toBeNull();
      expect(m.shadowSamplingRatePct).toBeNull();
      expect('fastPathSamples' in m).toBe(true);
      expect('ragSamples' in m).toBe(true);
    });
  });
});

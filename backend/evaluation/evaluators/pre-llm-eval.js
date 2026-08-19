import { performance } from 'perf_hooks';

/**
 * PreLLMProcessorChain
 * Chain of Responsibility Pattern implementation for measuring Map-Reduce summarization density,
 * context sliding window retention, and Fast-Path router SLA (<300ms).
 */
export class PreLLMProcessorChain {
  constructor() {
    this.handlers = [];
  }

  addHandler(handler) {
    this.handlers.push(handler);
    return this;
  }

  /**
   * Measure latency SLA for fast-path routing execution.
   * @param {Function} routerFn 
   * @param {Object} testCase 
   * @returns {Object} Latency evaluation result
   */
  async evaluateFastPathSLA(routerFn, testCase) {
    const startTime = performance.now();
    const result = await routerFn(testCase.user_query);
    const latencyMs = performance.now() - startTime;

    return {
      eval_id: testCase.eval_id || 'SLA-EVAL',
      latencyMs,
      passedSLA: latencyMs <= 300,
      result,
    };
  }

  /**
   * Calculate Information Density (FID) ratio post Map-Reduce compression.
   * @param {string} originalText 
   * @param {string} compressedSummary 
   * @returns {number} Retention ratio
   */
  calculateInformationDensity(originalText, compressedSummary) {
    if (!originalText || originalText.length === 0) return 1.0;
    const compressionRatio = compressedSummary.length / originalText.length;
    return Math.min(1.0, Math.max(0.1, 1.0 - compressionRatio));
  }
}

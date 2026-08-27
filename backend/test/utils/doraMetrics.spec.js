import { evaluateDoraTier, identifyDoraBottlenecks } from '../../src/utils/doraMetrics.js';

describe('doraMetrics Utility Specs', () => {
  describe('evaluateDoraTier', () => {
    it('should return ELITE for top-tier metrics', () => {
      const tier = evaluateDoraTier({
        deploymentFrequencyWeeks: 10,
        averageLeadTimeHours: 12,
        changeFailureRatePct: 3,
        mttrHours: 0.5,
      });
      expect(tier).toBe('ELITE');
    });

    it('should return HIGH for standard healthy metrics', () => {
      const tier = evaluateDoraTier({
        deploymentFrequencyWeeks: 3.5,
        averageLeadTimeHours: 48,
        changeFailureRatePct: 8,
        mttrHours: 2.5,
      });
      expect(tier).toBe('HIGH');
    });

    it('should return MEDIUM when metrics degrade', () => {
      const tier = evaluateDoraTier({
        deploymentFrequencyWeeks: 0.8,
        averageLeadTimeHours: 100,
        changeFailureRatePct: 18,
        mttrHours: 12,
      });
      expect(tier).toBe('MEDIUM');
    });

    it('should return LOW when metrics exceed critical failure boundaries', () => {
      const tier = evaluateDoraTier({
        deploymentFrequencyWeeks: 0.1,
        averageLeadTimeHours: 800,
        changeFailureRatePct: 35,
        mttrHours: 200,
      });
      expect(tier).toBe('LOW');
    });
  });

  describe('identifyDoraBottlenecks', () => {
    it('should detect review latency bottleneck', () => {
      const bottlenecks = identifyDoraBottlenecks({
        reviewWaitTimeHours: 18.5,
        averageLeadTimeHours: 24,
        changeFailureRatePct: 4,
        mttrHours: 1,
      });
      expect(bottlenecks.some((b) => b.includes('PR review latency'))).toBe(true);
    });

    it('should detect elevated change failure rate', () => {
      const bottlenecks = identifyDoraBottlenecks({
        reviewWaitTimeHours: 2,
        averageLeadTimeHours: 24,
        changeFailureRatePct: 22,
        mttrHours: 1,
      });
      expect(bottlenecks.some((b) => b.includes('Change Failure Rate'))).toBe(true);
    });

    it('should detect elevated MTTR SLA breach', () => {
      const bottlenecks = identifyDoraBottlenecks({
        reviewWaitTimeHours: 2,
        averageLeadTimeHours: 24,
        changeFailureRatePct: 4,
        mttrHours: 6.5,
      });
      expect(bottlenecks.some((b) => b.includes('Recovery time'))).toBe(true);
    });

    it('should return healthy status when within SLA bounds', () => {
      const bottlenecks = identifyDoraBottlenecks({
        reviewWaitTimeHours: 2,
        averageLeadTimeHours: 24,
        changeFailureRatePct: 2,
        mttrHours: 0.5,
      });
      expect(bottlenecks).toEqual(['Deployment pipeline and review throughput are operating within healthy SLA bounds.']);
    });
  });
});

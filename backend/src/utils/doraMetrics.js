/**
 * DORA Metrics & Engineering Flow Evaluation Utility
 * Standardizes DORA 4-tier benchmark evaluation and bottleneck detection across EM TaskFlow AI.
 */

/**
 * Evaluates DORA performance tier according to industry benchmarks (DORA 2023/2024 standards).
 * 
 * @param {Object} metrics
 * @param {number} metrics.deploymentFrequencyWeeks Deploys per week
 * @param {number} metrics.averageLeadTimeHours Lead time from commit/PR to prod in hours
 * @param {number} metrics.changeFailureRatePct Percentage of releases causing failure (0-100)
 * @param {number} metrics.mttrHours Mean time to restore service in hours
 * @returns {'ELITE'|'HIGH'|'MEDIUM'|'LOW'}
 */
export function evaluateDoraTier({
  deploymentFrequencyWeeks = 0,
  averageLeadTimeHours = 0,
  changeFailureRatePct = 0,
  mttrHours = 0,
}) {
  if (
    deploymentFrequencyWeeks < 0.25 ||
    averageLeadTimeHours > 720.0 ||
    changeFailureRatePct > 30.0 ||
    mttrHours > 168.0
  ) {
    return 'LOW';
  }
  if (
    deploymentFrequencyWeeks < 1.0 ||
    averageLeadTimeHours > 168.0 ||
    changeFailureRatePct > 15.0 ||
    mttrHours > 24.0
  ) {
    return 'MEDIUM';
  }
  if (
    deploymentFrequencyWeeks >= 7.0 &&
    averageLeadTimeHours <= 24.0 &&
    changeFailureRatePct <= 5.0 &&
    mttrHours <= 1.0
  ) {
    return 'ELITE';
  }
  return 'HIGH';
}

/**
 * Identifies delivery and reliability bottlenecks from DORA metrics.
 * 
 * @param {Object} metrics
 * @param {number} metrics.reviewWaitTimeHours
 * @param {number} metrics.averageLeadTimeHours
 * @param {number} metrics.changeFailureRatePct
 * @param {number} metrics.mttrHours
 * @returns {Array<string>} List of actionable bottleneck descriptions
 */
export function identifyDoraBottlenecks({
  reviewWaitTimeHours = 0,
  averageLeadTimeHours = 1,
  changeFailureRatePct = 0,
  mttrHours = 0,
}) {
  const bottlenecks = [];

  if (reviewWaitTimeHours > 12.0) {
    const pct = Math.round((reviewWaitTimeHours / Math.max(averageLeadTimeHours, 1)) * 100);
    bottlenecks.push(`PR review latency averages ${reviewWaitTimeHours}h (${pct}% of total lead time).`);
  }
  if (changeFailureRatePct > 15.0) {
    bottlenecks.push(`Elevated Change Failure Rate (${changeFailureRatePct}%) indicates insufficient pre-merge automated testing or staging verification.`);
  }
  if (mttrHours > 4.0) {
    bottlenecks.push(`Recovery time (${mttrHours}h) exceeds the 4-hour SLA. Recommend automated rollback triggers.`);
  }
  if (bottlenecks.length === 0) {
    bottlenecks.push('Deployment pipeline and review throughput are operating within healthy SLA bounds.');
  }

  return bottlenecks;
}

export default {
  evaluateDoraTier,
  identifyDoraBottlenecks,
};

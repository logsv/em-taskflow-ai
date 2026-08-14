import _ from 'lodash';

/**
 * MultiAgentTrajectoryStrategy
 * Strategy Pattern implementation for evaluating supervisor domain routing,
 * trajectory step efficiency, and 1-tool SLM constraint adherence on hermes3:8b.
 */
export class MultiAgentTrajectoryStrategy {
  constructor(name = 'MultiAgentTrajectoryStrategy') {
    this.name = name;
  }

  /**
   * Execute trajectory evaluation for a single test case using the router plan.
   * @param {Object} testCase - Item from GoldenDatasetRepository
   * @param {Object} plan - Output from router.invoke({ query: prompt })
   * @returns {Object} Metric evaluation result
   */
  async evaluate(testCase, plan) {
    const prompt = testCase.user_query || testCase.prompt || '';
    const { expected_domains, is_rag_appropriate } = testCase;
    const predicted_domains = plan?.domains || [];
    const expectedWorkspace = (expected_domains || []).some((domain) => domain !== 'rag');

    // Normalize domain aliases (jira/github -> delivery) to match llmRouter rules
    const normalizeDomain = (d) => (d === 'jira' || d === 'github' ? 'delivery' : d);
    const normalized_expected = _.uniq((expected_domains || []).map(normalizeDomain));
    const normalized_predicted = _.uniq(predicted_domains.map(normalizeDomain));

    const sorted_expected = _.sortBy(normalized_expected);
    const sorted_predicted = _.sortBy(normalized_predicted);

    const is_exact_match = _.isEqual(sorted_expected, sorted_predicted);
    
    // Domain Precision & Recall calculations
    const intersection = _.intersection(sorted_expected, sorted_predicted);
    const precision = sorted_predicted.length > 0 ? intersection.length / sorted_predicted.length : 0;
    const recall = sorted_expected.length > 0 ? intersection.length / sorted_expected.length : 0;

    const is_unnecessary_rag = !is_rag_appropriate && predicted_domains.includes('rag');
    
    // 1-Tool constraint check for local SLM accuracy on hermes3:8b
    const mustUseTools = plan?.must_use_tools === true;
    const predictedToolGrounded = expectedWorkspace ? mustUseTools : true;

    return {
      eval_id: testCase.eval_id || 'UNKNOWN',
      prompt,
      expected_domains,
      predicted_domains,
      precision,
      recall,
      is_exact_match,
      is_unnecessary_rag,
      must_use_tools: plan?.must_use_tools,
      allow_rag: plan?.allow_rag,
      predictedToolGrounded,
      confidence: Number.isFinite(Number(plan?.confidence)) ? Math.max(0, Math.min(1, Number(plan.confidence))) : 0,
    };
  }

  /**
   * Aggregate single evaluation results into system SLA metrics.
   * @param {Array} results 
   * @returns {Object} Aggregated metrics
   */
  aggregate(results) {
    const total = results.length;
    if (total === 0) {
      return { domainSelectionAccuracy: 0, unwantedRagRate: 0, toolGroundedRate: 0, avgPrecision: 0, avgRecall: 0 };
    }

    const exactMatches = results.filter((r) => r.is_exact_match).length;
    const unwantedRag = results.filter((r) => r.is_unnecessary_rag).length;
    const toolGrounded = results.filter((r) => r.predictedToolGrounded).length;
    const sumPrecision = results.reduce((acc, r) => acc + r.precision, 0);
    const sumRecall = results.reduce((acc, r) => acc + r.recall, 0);

    return {
      domainSelectionAccuracy: exactMatches / total,
      unwantedRagRate: unwantedRag / total,
      toolGroundedRate: toolGrounded / total,
      avgPrecision: sumPrecision / total,
      avgRecall: sumRecall / total,
    };
  }
}

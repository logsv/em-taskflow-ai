import _ from 'lodash';
import preRouterRewriter from '../../src/services/preRouterRewriter.js';

/**
 * ContextualResolutionStrategy
 * Strategy Pattern implementation for evaluating Tier 1 Query Rewriting,
 * Coreference Resolution, Entity Extraction, and Multi-Turn Follow-Up Context.
 */
export class ContextualResolutionStrategy {
  constructor(name = 'ContextualResolutionStrategy') {
    this.name = name;
  }

  /**
   * Execute evaluation for a single multi-turn context test case.
   * @param {Object} testCase - Item from GoldenDatasetRepository
   * @param {Object} plan - Output from router after contextual resolution
   * @returns {Object} Evaluation metrics
   */
  async evaluate(testCase, plan) {
    const rawQuery = testCase.user_query || '';
    const history = testCase.conversation_history || [];
    const expectedEntities = testCase.expected_entities || {};

    // Execute Tier 1 PreRouterRewriter
    const { rewrittenQuery, wasRewritten, entities } = preRouterRewriter.resolveQuery(rawQuery, history);

    // Entity Recall Check
    const expectedKeys = Object.keys(expectedEntities);
    let matchedEntities = 0;
    for (const key of expectedKeys) {
      if (entities[key] && String(entities[key]).toLowerCase() === String(expectedEntities[key]).toLowerCase()) {
        matchedEntities += 1;
      }
    }
    const entityRecall = expectedKeys.length > 0 ? matchedEntities / expectedKeys.length : 1.0;

    // Expected Domains Routing Check
    const expectedDomains = testCase.expected_domains || [];
    const predictedDomains = plan?.domains || [];
    const domainMatch = _.isEqual(_.sortBy(expectedDomains), _.sortBy(predictedDomains));

    return {
      eval_id: testCase.eval_id || 'UNKNOWN',
      rawQuery,
      rewrittenQuery,
      wasRewritten,
      entities,
      expectedEntities,
      entityRecall,
      domainMatch,
      expectedDomains,
      predictedDomains,
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
      return { coreferenceResolutionRate: 0, entityRecallRate: 0, multiTurnRoutingAccuracy: 0 };
    }

    const successfulResolutions = results.filter((r) => r.entityRecall >= 0.8).length;
    const sumEntityRecall = results.reduce((acc, r) => acc + r.entityRecall, 0);
    const domainMatches = results.filter((r) => r.domainMatch).length;

    return {
      coreferenceResolutionRate: successfulResolutions / total,
      entityRecallRate: sumEntityRecall / total,
      multiTurnRoutingAccuracy: domainMatches / total,
    };
  }
}

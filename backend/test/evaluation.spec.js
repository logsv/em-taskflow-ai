import { MultiAgentTrajectoryStrategy } from '../evaluation/evaluators/multi-agent-eval.js';
import { RAGPipelineStrategy } from '../evaluation/evaluators/rag-eval.js';
import { PreLLMProcessorChain } from '../evaluation/evaluators/pre-llm-eval.js';

describe('Enterprise Evaluation Framework Strategies', () => {
  describe('MultiAgentTrajectoryStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new MultiAgentTrajectoryStrategy();
    });

    it('should evaluate exact domain match correctly', async () => {
      const testCase = {
        eval_id: 'EVAL-JIRA-001',
        prompt: 'What are the current blockers for the phoenix project in Jira?',
        expected_domains: ['jira'],
        is_rag_appropriate: false,
      };

      const plan = {
        domains: ['jira'],
        must_use_tools: true,
        allow_rag: false,
        confidence: 0.95,
      };

      const result = await strategy.evaluate(testCase, plan);
      expect(result.is_exact_match).toBeTrue();
      expect(result.precision).toBe(1.0);
      expect(result.recall).toBe(1.0);
      expect(result.is_unnecessary_rag).toBeFalse();
      expect(result.predictedToolGrounded).toBeTrue();
    });

    it('should detect unnecessary RAG invocations', async () => {
      const testCase = {
        eval_id: 'EVAL-GITHUB-002',
        prompt: 'Review latest PRs',
        expected_domains: ['github'],
        is_rag_appropriate: false,
      };

      const plan = {
        domains: ['github', 'rag'],
        must_use_tools: true,
        confidence: 0.8,
      };

      const result = await strategy.evaluate(testCase, plan);
      expect(result.is_exact_match).toBeFalse();
      expect(result.is_unnecessary_rag).toBeTrue();
    });

    it('should aggregate metrics across multiple strategy runs', () => {
      const results = [
        { is_exact_match: true, is_unnecessary_rag: false, predictedToolGrounded: true, precision: 1.0, recall: 1.0 },
        { is_exact_match: false, is_unnecessary_rag: false, predictedToolGrounded: true, precision: 0.5, recall: 1.0 },
      ];

      const agg = strategy.aggregate(results);
      expect(agg.domainSelectionAccuracy).toBe(0.5);
      expect(agg.unwantedRagRate).toBe(0.0);
      expect(agg.toolGroundedRate).toBe(1.0);
    });
  });

  describe('RAGPipelineStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new RAGPipelineStrategy();
    });

    it('should validate markdown section structural compliance', async () => {
      const testCase = { eval_id: 'EVAL-RAG-003', ground_truth_context: ['Phoenix timeline'] };
      const response = '### 📄 Executive Summary\nSummary text\n### 🔍 Key Document Analysis\nAnalysis\n### 📌 Source Citations\nPhoenix timeline citation';

      const result = await strategy.evaluate(testCase, response);
      expect(result.isStructurallyValid).toBeTrue();
      expect(result.contextRecallScore).toBe(1.0);
      expect(result.faithfulnessScore).toBe(0.95);
    });

    it('should flag incomplete markdown structural responses', async () => {
      const testCase = { eval_id: 'EVAL-RAG-004' };
      const response = 'Plain text response without sections.';

      const result = await strategy.evaluate(testCase, response);
      expect(result.isStructurallyValid).toBeFalse();
      expect(result.faithfulnessScore).toBe(0.60);
    });
  });

  describe('PreLLMProcessorChain', () => {
    let chain;

    beforeEach(() => {
      chain = new PreLLMProcessorChain();
    });

    it('should measure fast-path SLA latency', async () => {
      const mockRouter = async () => ({ domains: ['chat'], must_use_tools: false });
      const testCase = { eval_id: 'EVAL-SLA-001', user_query: 'Calculate 2+2' };

      const result = await chain.evaluateFastPathSLA(mockRouter, testCase);
      expect(result.passedSLA).toBeTrue();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should compute information density ratio post compression', () => {
      const original = 'Very long original document content with thousands of words...';
      const summary = 'Summary';

      const fid = chain.calculateInformationDensity(original, summary);
      expect(fid).toBeGreaterThan(0.5);
    });
  });
});

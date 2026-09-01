import fs from 'fs';
import Ajv from 'ajv';
import { MultiAgentTrajectoryStrategy } from '../evaluation/evaluators/multi-agent-eval.js';
import { RAGPipelineStrategy } from '../evaluation/evaluators/rag-eval.js';
import { PreLLMProcessorChain } from '../evaluation/evaluators/pre-llm-eval.js';
import { ContextualResolutionStrategy } from '../evaluation/evaluators/context-eval.js';

describe('Enterprise Evaluation Framework Strategies', () => {
  describe('Golden Dataset Schema Validation', () => {
    it('should validate all 168 golden dataset benchmark items against JSON schema', () => {
      const ajv = new Ajv();
      const schema = JSON.parse(fs.readFileSync('evaluation/golden-dataset-schema.json', 'utf8'));
      const dataset = JSON.parse(fs.readFileSync('evaluation/golden-dataset.json', 'utf8'));

      const validate = ajv.compile(schema);
      const valid = validate(dataset);

      expect(valid).toBeTrue();
      expect(dataset.length).toBe(168);
    });
  });

  describe('MultiAgentTrajectoryStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new MultiAgentTrajectoryStrategy();
    });

    it('should evaluate exact domain match correctly across all 10 domain micro-agents', async () => {
      const domains = ['dora', 'delivery', 'sbi', 'people', 'sprint', 'retro', 'roadmap', 'okr', 'sop', 'critic'];

      for (const domain of domains) {
        const testCase = {
          eval_id: `EVAL-${domain.toUpperCase()}-001`,
          prompt: `Test prompt for ${domain}`,
          expected_domains: [domain],
          expected_tool_calls: [{ tool_name: `calculate_${domain}_metric` }],
          is_rag_appropriate: false,
        };

        const plan = {
          domains: [domain],
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
        expect(result.is_ast_valid).toBeTrue();
      }
    });

    it('should validate BFCL-style zero-tool abstention for fast-path queries', async () => {
      const testCase = {
        eval_id: 'EVAL-BFCL-001',
        prompt: 'Write a python function to compute fibonacci numbers',
        expected_domains: [],
        expected_tool_calls: [],
        is_rag_appropriate: false,
      };

      const plan = {
        domains: [],
        must_use_tools: false,
        allow_rag: false,
        confidence: 0.99,
      };

      const result = await strategy.evaluate(testCase, plan);
      expect(result.is_exact_match).toBeTrue();
      expect(result.is_tool_abstention_valid).toBeTrue();
      expect(result.is_unnecessary_rag).toBeFalse();
    });

    it('should detect unnecessary RAG invocations', async () => {
      const testCase = {
        eval_id: 'EVAL-GITHUB-002',
        prompt: 'Review latest PRs',
        expected_domains: ['delivery'],
        is_rag_appropriate: false,
      };

      const plan = {
        domains: ['delivery', 'rag'],
        must_use_tools: true,
        confidence: 0.8,
      };

      const result = await strategy.evaluate(testCase, plan);
      expect(result.is_exact_match).toBeFalse();
      expect(result.is_unnecessary_rag).toBeTrue();
    });

    it('should aggregate metrics across multiple strategy runs', () => {
      const results = [
        { is_exact_match: true, is_unnecessary_rag: false, predictedToolGrounded: true, precision: 1.0, recall: 1.0, is_ast_valid: true, is_tool_abstention_valid: true, expected_domains: ['dora'] },
        { is_exact_match: false, is_unnecessary_rag: false, predictedToolGrounded: true, precision: 0.5, recall: 1.0, is_ast_valid: true, is_tool_abstention_valid: true, expected_domains: ['delivery'] },
        { is_exact_match: true, is_unnecessary_rag: false, predictedToolGrounded: true, precision: 1.0, recall: 1.0, is_ast_valid: true, is_tool_abstention_valid: true, expected_domains: [] },
      ];

      const agg = strategy.aggregate(results);
      expect(agg.domainSelectionAccuracy).toBeCloseTo(0.666, 2);
      expect(agg.unwantedRagRate).toBe(0.0);
      expect(agg.toolGroundedRate).toBe(1.0);
      expect(agg.toolAbstentionRate).toBe(1.0);
      expect(agg.astValidationRate).toBe(1.0);
    });
  });

  describe('ContextualResolutionStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new ContextualResolutionStrategy();
    });

    it('should evaluate coreference resolution from multi-turn chat history', async () => {
      const testCase = {
        eval_id: 'EVAL-CONTEXT-001',
        user_query: 'Draft SBI feedback for the author of that PR',
        conversation_history: [
          { role: 'user', content: 'What are the open PRs in backend?' },
          { role: 'assistant', content: 'PR #104 by @alex-dev has been open for 4 days.' },
        ],
        expected_domains: ['sbi'],
        expected_entities: { engineer: '@alex-dev', pr: '#104' },
      };

      const plan = {
        domains: ['sbi'],
        must_use_tools: true,
      };

      const result = await strategy.evaluate(testCase, plan);
      expect(result.domainMatch).toBeTrue();
      expect(result.eval_id).toBe('EVAL-CONTEXT-001');
    });

    it('should aggregate multi-turn context resolution metrics', () => {
      const results = [
        { entityRecall: 1.0, domainMatch: true },
        { entityRecall: 0.9, domainMatch: true },
        { entityRecall: 0.5, domainMatch: false },
      ];

      const agg = strategy.aggregate(results);
      expect(agg.coreferenceResolutionRate).toBeCloseTo(0.666, 2);
      expect(agg.multiTurnRoutingAccuracy).toBeCloseTo(0.666, 2);
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


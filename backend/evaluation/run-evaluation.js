import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { initializeLLM } from '../src/llm/index.js';
import { getRouterChain } from '../src/agent/llmRouter.js';
import { getRuntimeConfig } from '../src/config.js';
import { MultiAgentTrajectoryStrategy } from './evaluators/multi-agent-eval.js';
import { RAGPipelineStrategy } from './evaluators/rag-eval.js';
import { PreLLMProcessorChain } from './evaluators/pre-llm-eval.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * Repository Pattern: GoldenDatasetRepository
 * Encapsulates access and validation of evaluation benchmark prompts.
 */
class GoldenDatasetRepository {
  static loadDataset() {
    const goldenPath = path.join(__dirname, 'golden-dataset.json');
    const legacyPath = path.join(__dirname, 'test-prompts.json');

    const filePath = fs.existsSync(goldenPath) ? goldenPath : legacyPath;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}

/**
 * Composite Evaluation Runner
 * Executes evaluation strategies (Multi-Agent Trajectory, RAG, Pre-LLM SLA) using hermes3:8b.
 */
async function runEvaluation() {
  console.log('🧪 Initializing Evaluation Suite (Model: hermes3:8b)...');
  await initializeLLM();

  const router = getRouterChain();
  const runtime = getRuntimeConfig();
  const gates = runtime.router?.successGates || {};

  const dataset = GoldenDatasetRepository.loadDataset();
  const totalPrompts = dataset.length;

  const trajectoryStrategy = new MultiAgentTrajectoryStrategy();
  const ragStrategy = new RAGPipelineStrategy();
  const preLlmChain = new PreLLMProcessorChain();

  const trajectoryResults = [];
  const ragResults = [];
  const slaResults = [];

  console.log(`📋 Running evaluation across ${totalPrompts} benchmark items...\n`);

  for (const testCase of dataset) {
    try {
      // 1. Evaluate Multi-Agent Trajectory Strategy
      const plan = await router.invoke({ query: testCase.user_query || testCase.prompt });
      const trajEval = await trajectoryStrategy.evaluate(testCase, plan);
      trajectoryResults.push(trajEval);

      // 2. Evaluate RAG Pipeline Strategy if appropriate
      if (testCase.is_rag_appropriate || testCase.domain_category === 'rag_sop') {
        const ragEval = await ragStrategy.evaluate(testCase, testCase.ground_truth_answer || '### 📄 Executive Summary\nSample response');
        ragResults.push(ragEval);
      }

      // 3. Evaluate Fast-Path Latency SLA Strategy
      if (testCase.domain_category === 'fast_path_edge') {
        const slaEval = await preLlmChain.evaluateFastPathSLA((q) => router.invoke({ query: q }), testCase);
        slaResults.push(slaEval);
      }

    } catch (error) {
      console.error(`❌ Error evaluating item [${testCase.eval_id || testCase.prompt}]:`, error.message);
      trajectoryResults.push({
        eval_id: testCase.eval_id || 'ERROR',
        prompt: testCase.user_query || testCase.prompt,
        expected_domains: testCase.expected_domains,
        predicted_domains: ['ERROR'],
        precision: 0,
        recall: 0,
        is_exact_match: false,
        is_unnecessary_rag: false,
        predictedToolGrounded: false,
        confidence: 0,
        error: error.message,
      });
    }
  }

  // Aggregate metrics across strategies
  const trajAgg = trajectoryStrategy.aggregate(trajectoryResults);
  const ragAgg = ragStrategy.aggregate(ragResults);

  const domainSelectionAccuracy = trajAgg.domainSelectionAccuracy;
  const unwantedRagRate = trajAgg.unwantedRagRate;
  const toolGroundedRate = trajAgg.toolGroundedRate;

  const gateResults = {
    domainSelectionAccuracy: domainSelectionAccuracy >= (gates.domainSelectionAccuracyMin ?? 0.90),
    unwantedRagRate: unwantedRagRate <= (gates.unwantedRagRateMax ?? 0.05),
    toolGroundedRate: toolGroundedRate >= (gates.toolGroundedRateMin ?? 0.95),
  };

  const allPassed = Object.values(gateResults).every(Boolean);

  console.log('\n📊 Evaluation Metric Summary (hermes3:8b):');
  console.table(trajectoryResults.map((r) => ({
    ID: r.eval_id,
    Query: r.prompt ? r.prompt.substring(0, 40) + '...' : '',
    Expected: (r.expected_domains || []).join(', '),
    Predicted: Array.isArray(r.predicted_domains) ? r.predicted_domains.join(', ') : r.predicted_domains,
    ExactMatch: r.is_exact_match ? '✅' : '❌',
    ToolGrounded: r.predictedToolGrounded ? '✅' : '❌',
  })));

  console.log('\n🚦 Success Gate Assertions:');
  console.log(`  - Domain Selection Accuracy (>= 90%): ${(domainSelectionAccuracy * 100).toFixed(2)}% [${gateResults.domainSelectionAccuracy ? 'PASS' : 'FAIL'}]`);
  console.log(`  - Unwanted RAG Rate (<= 5%): ${(unwantedRagRate * 100).toFixed(2)}% [${gateResults.unwantedRagRate ? 'PASS' : 'FAIL'}]`);
  console.log(`  - Tool Grounded Rate (>= 95%): ${(toolGroundedRate * 100).toFixed(2)}% [${gateResults.toolGroundedRate ? 'PASS' : 'FAIL'}]`);

  if (!allPassed) {
    console.error('\n❌ Evaluation failed success gate SLAs!');
    process.exitCode = 1;
  } else {
    console.log('\n✅ All evaluation success gates passed successfully!');
  }
}

runEvaluation();

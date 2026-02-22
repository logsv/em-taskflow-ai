import { getRouterChain } from '../src/agent/llmRouter.js';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { initializeLLM } from '../src/llm/index.js';
import { getRuntimeConfig } from '../src/config.js';
import 'dotenv/config';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const testPrompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-prompts.json'), 'utf-8'));


async function runEvaluation() {
  await initializeLLM();

  const router = getRouterChain();
  const runtime = getRuntimeConfig();
  const gates = runtime.router?.successGates || {};
  let correctDomainSelections = 0;
  let unnecessaryRagInvocations = 0;
  let workspacePrompts = 0;
  let toolGroundedPredictions = 0;
  let emUsefulnessScoreTotal = 0;
  const totalPrompts = testPrompts.length;
  const results = [];

  console.log('🧪 Starting evaluation...');

  for (const testCase of testPrompts) {
    const { prompt, expected_domains, is_rag_appropriate } = testCase;

    try {
      const plan = await router.invoke({ query: prompt });
      const predicted_domains = plan.domains || [];
      const expectedWorkspace = (expected_domains || []).some((domain) => domain !== 'rag');

      const sorted_expected = _.sortBy(expected_domains);
      const sorted_predicted = _.sortBy(predicted_domains);

      let is_correct = false;
      if (_.isEqual(sorted_expected, sorted_predicted)) {
        correctDomainSelections++;
        is_correct = true;
      }

      let is_unnecessary_rag = false;
      if (!is_rag_appropriate && predicted_domains.includes('rag')) {
        unnecessaryRagInvocations++;
        is_unnecessary_rag = true;
      }

      let predictedToolGrounded = false;
      if (expectedWorkspace) {
        workspacePrompts++;
        predictedToolGrounded = plan.must_use_tools === true;
        if (predictedToolGrounded) {
          toolGroundedPredictions++;
        }
      }

      const confidence = Number(plan.confidence);
      const normalizedConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
      emUsefulnessScoreTotal += normalizedConfidence;
      
      results.push({
        prompt,
        expected_domains,
        predicted_domains,
        must_use_tools: plan.must_use_tools,
        allow_rag: plan.allow_rag,
        confidence: normalizedConfidence,
        is_correct,
        is_unnecessary_rag,
        predictedToolGrounded,
      });

    } catch (error) {
        console.error(`Error processing prompt: "${prompt}"`, error);
        results.push({
            prompt,
            expected_domains,
            predicted_domains: 'ERROR',
            must_use_tools: 'ERROR',
            allow_rag: 'ERROR',
            confidence: 0,
            is_correct: false,
            is_unnecessary_rag: false,
            predictedToolGrounded: false,
            error: error.message,
        });
    }
  }

  const domainSelectionAccuracy = totalPrompts > 0 ? correctDomainSelections / totalPrompts : 0;
  const unwantedRagRate = totalPrompts > 0 ? unnecessaryRagInvocations / totalPrompts : 0;
  const toolGroundedRate = workspacePrompts > 0 ? toolGroundedPredictions / workspacePrompts : 1;
  const emUsefulness = totalPrompts > 0 ? emUsefulnessScoreTotal / totalPrompts : 0;
  const gateResults = {
    domainSelectionAccuracy: domainSelectionAccuracy >= (gates.domainSelectionAccuracyMin ?? 0.9),
    unwantedRagRate: unwantedRagRate <= (gates.unwantedRagRateMax ?? 0.05),
    toolGroundedRate: toolGroundedRate >= (gates.toolGroundedRateMin ?? 0.95),
    emUsefulness: emUsefulness >= (gates.emUsefulnessMin ?? 0.8),
  };
  const allPassed = Object.values(gateResults).every(Boolean);

  console.log('\n📋 Evaluation Results:\n');
  console.table(results);

  console.log('\n📊 Evaluation Report:');
  console.log(`  - Total prompts: ${totalPrompts}`);
  console.log(`  - Correct domain selections: ${correctDomainSelections} (${(domainSelectionAccuracy * 100).toFixed(2)}%)`);
  console.log(`  - Unnecessary RAG invocations: ${unnecessaryRagInvocations}`);
  console.log(`  - Workspace tool-grounding predictions: ${toolGroundedPredictions}/${workspacePrompts} (${(toolGroundedRate * 100).toFixed(2)}%)`);
  console.log(`  - EM usefulness proxy (avg confidence): ${(emUsefulness * 100).toFixed(2)}%`);

  console.log('\n🚦 Success Gates:');
  console.log(`  - Domain selection accuracy >= ${(gates.domainSelectionAccuracyMin ?? 0.9) * 100}%: ${gateResults.domainSelectionAccuracy ? 'PASS' : 'FAIL'}`);
  console.log(`  - Unwanted RAG rate <= ${(gates.unwantedRagRateMax ?? 0.05) * 100}%: ${gateResults.unwantedRagRate ? 'PASS' : 'FAIL'}`);
  console.log(`  - Tool-grounded rate >= ${(gates.toolGroundedRateMin ?? 0.95) * 100}%: ${gateResults.toolGroundedRate ? 'PASS' : 'FAIL'}`);
  console.log(`  - EM usefulness proxy >= ${(gates.emUsefulnessMin ?? 0.8) * 100}%: ${gateResults.emUsefulness ? 'PASS' : 'FAIL'}`);

  if (!allPassed) {
    process.exitCode = 1;
  }
}

runEvaluation();

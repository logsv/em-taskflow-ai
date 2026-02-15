import { getRouterChain } from '../src/agent/llmRouter.js';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { initializeLLM } from '../src/llm/index.js';
import 'dotenv/config';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const testPrompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-prompts.json'), 'utf-8'));


async function runEvaluation() {
  await initializeLLM();

  const router = getRouterChain();
  let correctDomainSelections = 0;
  let unnecessaryRagInvocations = 0;
  const totalPrompts = testPrompts.length;
  const results = [];

  console.log('🧪 Starting evaluation...');

  for (const testCase of testPrompts) {
    const { prompt, expected_domains, is_rag_appropriate } = testCase;

    try {
      const plan = await router.invoke({ query: prompt });
      const predicted_domains = plan.domains || [];

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
      
      results.push({
        prompt,
        expected_domains,
        predicted_domains,
        is_correct,
        is_unnecessary_rag,
      });

    } catch (error) {
        console.error(`Error processing prompt: "${prompt}"`, error);
        results.push({
            prompt,
            expected_domains,
            predicted_domains: 'ERROR',
            is_correct: false,
            is_unnecessary_rag: false,
            error: error.message,
        });
    }
  }

  console.log('\n📋 Evaluation Results:\n');
  console.table(results);

  console.log('\n📊 Evaluation Report:');
  console.log(`  - Total prompts: ${totalPrompts}`);
  console.log(`  - Correct domain selections: ${correctDomainSelections} (${((correctDomainSelections / totalPrompts) * 100).toFixed(2)}%)`);
  console.log(`  - Unnecessary RAG invocations: ${unnecessaryRagInvocations}`);
}

runEvaluation();

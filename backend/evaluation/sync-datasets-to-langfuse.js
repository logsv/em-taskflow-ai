import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Langfuse } from 'langfuse';

dotenv.config();

const DATASETS_DIR = fs.existsSync(path.resolve('evaluation/golden-dataset.json'))
  ? path.resolve('evaluation')
  : (fs.existsSync(path.resolve('../evaluations/datasets/golden-dataset.json'))
      ? path.resolve('../evaluations/datasets')
      : path.resolve('evaluations/datasets'));

export async function syncDatasetsToLangfuse() {
  const host = process.env.LANGFUSE_HOST || 'http://localhost:3001';
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!publicKey || !secretKey) {
    console.error('❌ LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY missing in environment');
    return { success: false, error: 'Credentials missing' };
  }

  const langfuse = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: host,
    flushAt: 1,
  });

  console.log(`🔗 Connecting to Langfuse at ${host}...`);

  // 1. Sync golden-dataset (76 items)
  let goldenCount = 0;
  const goldenPath = path.join(DATASETS_DIR, 'golden-dataset.json');
  if (fs.existsSync(goldenPath)) {
    const goldenItems = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    console.log(`📦 Loaded ${goldenItems.length} items from ${goldenPath}`);

    try {
      await langfuse.createDataset({
        name: 'golden-dataset',
        description: 'EM TaskFlow AI Golden Evaluation Benchmark Dataset across 10 Domain Micro-Agents, RAG, and Fast-Path.',
        metadata: { version: '1.0.0', total_cases: goldenItems.length, system: 'EM TaskFlow AI' },
      });
      console.log(`✅ Verified dataset 'golden-dataset' in Langfuse`);
    } catch (err) {
      console.log(`ℹ️ Dataset 'golden-dataset' notice: ${err.message}`);
    }

    // Check existing dataset items to avoid duplicates
    let existingItemMap = new Map();
    try {
      const existingDs = await langfuse.getDataset('golden-dataset');
      if (existingDs && Array.isArray(existingDs.items)) {
        for (const item of existingDs.items) {
          const evalId = item.metadata?.eval_id || item.input?.query;
          if (evalId) existingItemMap.set(evalId, item);
        }
      }
    } catch (_) {}

    for (const item of goldenItems) {
      const key = item.eval_id || item.user_query;
      if (existingItemMap.has(key)) {
        goldenCount++;
        continue;
      }
      try {
        await langfuse.createDatasetItem({
          datasetName: 'golden-dataset',
          input: {
            query: item.user_query || item.prompt || '',
            conversation_history: item.conversation_history || [],
          },
          expectedOutput: {
            expected_domains: item.expected_domains || [],
            expected_tool_calls: item.expected_tool_calls || [],
            ground_truth_context: item.ground_truth_context || [],
          },
          metadata: {
            eval_id: item.eval_id || '',
            domain_category: item.domain_category || '',
            is_rag_appropriate: item.is_rag_appropriate || false,
            success_criteria_gates: item.success_criteria_gates || {},
          },
        });
        goldenCount++;
      } catch (err) {
        console.warn(`⚠️ Failed item ${item.eval_id}: ${err.message}`);
      }
    }
    console.log(`🎉 Synced ${goldenCount}/${goldenItems.length} items to 'golden-dataset'!`);
  }

  // 2. Sync prompt-matrix-cases (10 items)
  let matrixCount = 0;
  const matrixPath = path.join(DATASETS_DIR, 'prompt-matrix-cases.json');
  if (fs.existsSync(matrixPath)) {
    const matrixCases = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    console.log(`📦 Loaded ${matrixCases.length} items from ${matrixPath}`);

    try {
      await langfuse.createDataset({
        name: 'prompt-matrix-cases',
        description: 'Multi-Turn Prompt Matrix Benchmark Cases for Durable Temporal Batch Evaluations.',
        metadata: { version: '1.0.0', total_cases: matrixCases.length, system: 'EM TaskFlow AI' },
      });
      console.log(`✅ Verified dataset 'prompt-matrix-cases' in Langfuse`);
    } catch (err) {
      console.log(`ℹ️ Dataset 'prompt-matrix-cases' notice: ${err.message}`);
    }

    let existingMatrixMap = new Map();
    try {
      const existingMatrixDs = await langfuse.getDataset('prompt-matrix-cases');
      if (existingMatrixDs && Array.isArray(existingMatrixDs.items)) {
        for (const item of existingMatrixDs.items) {
          const caseId = item.metadata?.case_id || item.input?.prompt;
          if (caseId) existingMatrixMap.set(caseId, item);
        }
      }
    } catch (_) {}

    for (const item of matrixCases) {
      const key = item.id || item.prompt;
      if (existingMatrixMap.has(key)) {
        matrixCount++;
        continue;
      }
      try {
        await langfuse.createDatasetItem({
          datasetName: 'prompt-matrix-cases',
          input: {
            prompt: item.prompt || '',
          },
          expectedOutput: {
            domain: item.domain || '',
            expected_tool: item.expected_tool || '',
            must_contain: item.must_contain || [],
          },
          metadata: {
            case_id: item.id || '',
            domain: item.domain || '',
          },
        });
        matrixCount++;
      } catch (err) {
        console.warn(`⚠️ Failed matrix item ${item.id}: ${err.message}`);
      }
    }
    console.log(`🎉 Synced ${matrixCount}/${matrixCases.length} items to 'prompt-matrix-cases'!`);
  }

  await langfuse.flushAsync();
  console.log('🚀 All datasets successfully flushed to Langfuse!');
  return { success: true, goldenCount, matrixCount };
}

if (process.argv[1]?.endsWith('sync-datasets-to-langfuse.js')) {
  syncDatasetsToLangfuse().catch(err => {
    console.error(`❌ Dataset sync failed: ${err.message}`);
    process.exit(1);
  });
}

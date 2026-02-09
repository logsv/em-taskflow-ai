import express from 'express';
import { baselineRetrieve, agenticRetrieve } from '../rag/index.js';
import { getRagConfig, getRagAdvancedConfig } from '../config.js';

const router = express.Router();

router.post('/query', async (req, res) => {
  try {
    const { query, mode } = req.body || {};
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const ragConfig = getRagConfig();
    const ragAdvanced = getRagAdvancedConfig();
    const resolvedMode = mode === 'advanced' ? 'advanced' : 'baseline';

    if (resolvedMode === 'advanced' && !ragAdvanced.enabled) {
      return res.status(400).json({
        error: 'Advanced RAG mode is disabled. Enable it via RAG_ADVANCED_ENABLED=true.',
      });
    }

    if (resolvedMode === 'baseline') {
      const result = await baselineRetrieve(query, { topK: ragConfig.topK });
      return res.json({
        answer: result.answer,
        sources: result.sources.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        })),
        meta: {
          mode: 'baseline',
          topK: ragConfig.topK,
          executionTime: result.executionTime,
        },
      });
    }

    const result = await agenticRetrieve(query);
    return res.json({
      answer: result.answer,
      sources: result.sources.map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
      meta: {
        mode: 'advanced',
        rewrittenQueries: result.rewrittenQueries,
        compressionApplied: result.compressionApplied,
        reranked: result.reranked,
        executionTime: result.executionTime,
      },
    });
  } catch (error) {
    console.error('❌ RAG query error:', error);
    const message = error.message || 'Failed to process RAG query';
    const status = message.includes('timed out') ? 504 : 500;
    return res.status(status).json({ error: message });
  }
});

export default router;

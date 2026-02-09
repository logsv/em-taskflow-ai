import express from 'express';
import { z } from 'zod';
import { baselineRetrieve, agenticRetrieve } from '../rag/index.js';
import { getRagConfig, getRagAdvancedConfig } from '../config.js';

const router = express.Router();
const querySchema = z.object({
  query: z.string().min(1).max(10_000),
  mode: z.enum(['baseline', 'advanced']).optional(),
});

router.post('/query', async (req, res) => {
  try {
    const parsed = querySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const { query, mode } = parsed.data;

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

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import ragService from '../rag/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const pdfDir = path.join(__dirname, '../../data/pdfs/');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
const upload = multer({ dest: pdfDir });

const documentQuerySchema = z.object({
  query: z.string().min(1).max(10_000),
  mode: z.enum(['baseline', 'advanced']).optional(),
  topK: z.coerce.number().int().min(1).max(20).optional(),
});

router.post('/ingest', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF uploaded', requestId: req.requestId });
    }

    const result = await ragService.processPDF(req.file.path, req.file.originalname || 'unknown.pdf');
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to process PDF',
        details: result.error,
        requestId: req.requestId,
      });
    }

    return res.json({
      status: 'success',
      documentId: req.file.originalname || 'unknown.pdf',
      chunks: result.chunks,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to ingest document',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/documents', async (req, res) => {
  try {
    const documents = await ragService.listDocuments();
    res.json({
      documents,
      requestId: req.requestId,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list documents',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.get('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const document = await ragService.getDocument(documentId);
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        requestId: req.requestId,
      });
    }

    return res.json({
      document,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get document',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

router.post('/documents/:documentId/query', async (req, res) => {
  try {
    const parsed = documentQuerySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        requestId: req.requestId,
      });
    }

    const { documentId } = req.params;
    const document = await ragService.getDocument(documentId);
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        requestId: req.requestId,
      });
    }

    const { query, mode, topK } = parsed.data;
    const result = await ragService.queryDocument(documentId, query, {
      mode,
      topK,
    });

    return res.json({
      answer: result.answer,
      document,
      sources: (result.sources || []).map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
      meta: {
        mode: mode === 'advanced' ? 'advanced' : 'baseline',
      },
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to query document',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

export default router;

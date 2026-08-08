import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { getApiConfig } from '../config.js';
import ragService from '../rag/index.js';
import uploadPdfApplicationService from '../application/upload/UploadPdfApplicationService.js';
import { createLegacyEndpointGate } from './legacyRouteGate.js';
import { getWorkflowStatus } from '../temporal/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
const legacyApiConfig = getApiConfig().legacy;
const requireLegacyRagIngestApi = createLegacyEndpointGate({
  enabled: legacyApiConfig.ragIngest.enabled,
  replacement: '/api/rag/upload',
});
const requireLegacyRagDocumentsApi = createLegacyEndpointGate({
  enabled: legacyApiConfig.ragDocuments.enabled,
  replacement: '/api/chat',
});

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

const uploadAny = upload.any();

async function handleFileUpload(req, res) {
  try {
    const uploadedFile = req.file || (req.files && req.files.length > 0 ? req.files[0] : null);
    const response = await uploadPdfApplicationService.processUpload({
      file: uploadedFile,
      requestId: req.requestId,
    });
    return res.status(response.statusCode).json(response.body);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to ingest document',
      details: error.message,
      requestId: req.requestId,
    });
  }
}

router.post('/upload', uploadAny, handleFileUpload);
router.post('/ingest', requireLegacyRagIngestApi, uploadAny, handleFileUpload);

router.get('/workflows/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const status = await getWorkflowStatus(workflowId);
    if (!status) {
      return res.status(404).json({
        error: 'Workflow status unavailable',
        requestId: req.requestId,
      });
    }
    return res.json({
      ...status,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to query workflow status',
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

router.get('/documents/:documentId', requireLegacyRagDocumentsApi, async (req, res) => {
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

router.post('/documents/:documentId/query', requireLegacyRagDocumentsApi, async (req, res) => {
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

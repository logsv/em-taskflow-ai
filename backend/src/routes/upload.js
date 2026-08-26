import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pythonAIServiceClient from '../grpc/client.js';
import { attachSessionContext } from '../middleware/sessionContext.js';
import { startChatFileExtractWorkflow, getWorkflowStatus } from '../temporal/client.js';
import { info, warn, error, debug } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const tempDir = path.join(__dirname, '../../data/pdfs/');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${uniqueSuffix}_${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max limit
});

/**
 * POST /api/chat/upload
 * Triggers Temporal ChatFileExtractWorkflow with synchronous fallback
 */
router.post('/', attachSessionContext, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, path: filePath, size } = req.file;
    debug({ module: 'upload', action: 'receiveChatUpload', originalname, mimetype, size }, `Chat file upload received: ${originalname}`);

    // Try Temporal Durable Workflow first
    try {
      const temporalRes = await startChatFileExtractWorkflow(filePath, originalname, mimetype);
      if (temporalRes && temporalRes.workflowId) {
        return res.status(202).json({
          status: 'processing',
          mode: 'temporal',
          workflowId: temporalRes.workflowId,
          filename: originalname,
          requestId: req.requestId,
        });
      }
    } catch (err) {
      warn({ module: 'upload', action: 'startChatFileExtractWorkflowFallback', filename: originalname, err }, 'Temporal Chat File Extract workflow fallback');
    }

    // Direct synchronous fallback via Python AI Service
    const buffer = fs.readFileSync(filePath);
    const extractionResult = await pythonAIServiceClient.extractDocument(buffer, originalname, mimetype);

    const attachmentPayload = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      filename: originalname,
      mimeType: mimetype,
      sizeBytes: size,
      extractedText: extractionResult.extracted_text || '',
      pageCount: extractionResult.page_count || 1,
      extractionMethod: extractionResult.extraction_method || 'none',
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      mode: 'direct',
      attachment: attachmentPayload,
      message: 'Attachment extracted successfully for chat prompt injection',
      requestId: req.requestId,
    });
  } catch (err) {
    error({ module: 'upload', action: 'chatUploadError', err }, 'Chat upload failed');
    return res.status(500).json({
      success: false,
      error: 'File attachment extraction failed',
      details: err.message,
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/chat/upload/workflows/:workflowId
 * Poll workflow completion status for Chat File Extraction
 */
router.get('/workflows/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const wfStatus = await getWorkflowStatus(workflowId);
    if (!wfStatus) {
      return res.status(404).json({
        error: 'Workflow status unavailable',
        requestId: req.requestId,
      });
    }

    if (wfStatus.status === 'COMPLETED' && wfStatus.result) {
      const result = wfStatus.result;
      const attachmentPayload = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        filename: result.filename || 'file',
        mimeType: 'application/octet-stream',
        extractedText: result.extracted_text || '',
        pageCount: result.page_count || 1,
        extractionMethod: result.extraction_method || 'temporal_activity',
        timestamp: new Date().toISOString(),
      };

      return res.json({
        status: 'COMPLETED',
        mode: 'temporal',
        workflowId,
        attachment: attachmentPayload,
        requestId: req.requestId,
      });
    }

    return res.json({
      status: wfStatus.status,
      mode: 'temporal',
      workflowId,
      error: wfStatus.error || undefined,
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to query chat workflow status',
      details: error.message,
      requestId: req.requestId,
    });
  }
});

export default router;

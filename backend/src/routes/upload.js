/**
 * Fast-Path Chat File & Image Attachment Upload Route
 * Extracts document text/images in <1.5s for direct interactive chat prompt injection.
 */

import express from 'express';
import multer from 'multer';
import pythonAIServiceClient from '../grpc/client.js';
import { attachSessionContext } from '../middleware/sessionContext.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max limit
});

/**
 * POST /api/chat/upload
 * Fast-path upload route returning extracted text/image context in <1.5s
 */
router.post('/', attachSessionContext, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, buffer } = req.file;
    console.log(`📎 Fast-path chat upload received: ${originalname} (${mimetype}, ${buffer.length} bytes)`);

    // Call Python AI Microservice FileUploadProcessor
    const extractionResult = await pythonAIServiceClient.extractDocument(buffer, originalname, mimetype);

    const attachmentPayload = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      filename: originalname,
      mimeType: mimetype,
      sizeBytes: buffer.length,
      extractedText: extractionResult.extracted_text || '',
      pageCount: extractionResult.page_count || 1,
      extractionMethod: extractionResult.extraction_method || 'none',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json({
      success: true,
      attachment: attachmentPayload,
      message: 'Attachment extracted successfully for chat prompt injection',
    });
  } catch (error) {
    console.error('❌ Chat upload failed:', error);
    res.status(500).json({
      success: false,
      error: 'File attachment extraction failed',
      details: error.message,
    });
  }
});

export default router;

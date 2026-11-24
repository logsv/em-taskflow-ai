/**
 * Admin: uploaded RAG documents.
 */
import express from 'express';
import databaseService from '../../db/postgres.js';
import ragService from '../../rag/index.js';
import { sendError } from '../../middleware/errorHandler.js';

const router = express.Router();

router.get('/documents', async (req, res) => {
  try {
    const documents = await ragService.listDocuments();
    res.json({
      documents,
      count: documents.length,
      requestId: req.requestId,
    });
  } catch (error) {
    return sendError(req, res, error, 'Failed to list RAG documents');
  }
});

// Delete Document Chunks
router.delete('/documents/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const deletedCount = await databaseService.deletePdfDocument(filename);
    res.json({
      success: true,
      filename,
      deletedChunks: deletedCount,
      requestId: req.requestId,
    });
  } catch (error) {
    return sendError(req, res, error, 'Failed to delete document chunks');
  }
});

// Get Chunks for a specific Document
router.get('/documents/:filename/chunks', async (req, res) => {
  try {
    const { filename } = req.params;
    const chunks = await databaseService.getPdfChunksByFilename(filename, 100);
    res.json({
      filename,
      chunks,
      count: chunks.length,
      requestId: req.requestId,
    });
  } catch (error) {
    return sendError(req, res, error, 'Failed to fetch document chunks');
  }
});

// ==============================================================================
// Dynamic Admin Settings & Model/Tool Management
// ==============================================================================

// GET /api/admin/settings - Fetch current active settings with masked secrets

export default router;

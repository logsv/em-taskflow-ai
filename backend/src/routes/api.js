import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ragService from '../rag/index.js';
import ragRouter from './rag.js';
import { config, getRuntimeConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const pdfDir = path.join(__dirname, '../../data/pdfs/');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
const upload = multer({ dest: pdfDir });

router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📄 Processing uploaded PDF:', req.file.originalname);

    const result = await ragService.processPDF(req.file.path, req.file.originalname || 'unknown.pdf');

    if (result.success) {
      res.json({
        status: 'success',
        message: `PDF processed successfully. Created ${result.chunks} chunks.`,
        chunks: result.chunks,
        filename: req.file.originalname,
      });
    } else {
      res.status(500).json({
        error: 'Failed to process PDF',
        details: result.error,
      });
    }
  } catch (err) {
    console.error('❌ PDF upload error:', err);
    res.status(500).json({ error: 'Failed to process PDF upload' });
  }
});

router.get('/health', async (req, res) => {
  try {
    const runtimeConfig = getRuntimeConfig();
    const healthStatus = {
      status: 'healthy',
      services: {
        database: 'healthy',
      },
      runtimeMode: runtimeConfig.mode,
      timestamp: new Date().toISOString(),
    };

    res.json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      message: `Health check failed: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/llm-status', async (req, res) => {
  try {
    res.json({
      status: 'success',
      data: {
        model: config.llm.defaultModel,
        provider: config.llm.defaultProvider,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('LLM status error:', error);
    res.status(500).json({
      status: 'error',
      message: `Failed to get LLM status: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});

router.use('/rag', ragRouter);

export default router;

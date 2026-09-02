import ragService from '../../rag/index.js';
import { startRAGIngestWorkflow } from '../../temporal/client.js';
import { cacheInvalidator } from '../../cache/cacheInvalidator.js';
import { warn } from '../../utils/logger.js';

export class UploadPdfApplicationService {
  constructor({ rag = ragService } = {}) {
    this.ragService = rag;
  }

  async processUpload({ file, requestId = null }) {
    if (!file) {
      return {
        statusCode: 400,
        body: {
          error: 'No PDF uploaded',
          requestId,
        },
      };
    }

    const filename = file.originalname || 'unknown.pdf';

    // Trigger event-driven cache invalidation for this document
    cacheInvalidator.invalidateDocument(filename).catch(() => {});

    // Try Temporal Durable Workflow first
    try {
      const temporalRes = await startRAGIngestWorkflow(file.path, filename);
      if (temporalRes && temporalRes.workflowId) {
        return {
          statusCode: 202,
          body: {
            status: 'processing',
            mode: 'temporal',
            workflowId: temporalRes.workflowId,
            documentId: filename,
            filename,
            requestId,
          },
        };
      }
    } catch (err) {
      warn({ module: 'upload', action: 'startRAGIngestWorkflowFallback', filename, err }, 'Temporal workflow trigger fallback');
    }

    // Direct synchronous fallback
    const result = await this.ragService.processPDF(file.path, filename);
    if (!result.success) {
      return {
        statusCode: 500,
        body: {
          error: 'Failed to process PDF',
          details: result.error,
          requestId,
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        status: 'success',
        mode: 'direct',
        documentId: filename,
        filename,
        chunks: result.chunks,
        requestId,
      },
    };
  }
}

const uploadPdfApplicationService = new UploadPdfApplicationService();
export default uploadPdfApplicationService;

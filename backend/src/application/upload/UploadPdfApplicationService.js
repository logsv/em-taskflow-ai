import ragService from '../../rag/index.js';

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

    const result = await this.ragService.processPDF(file.path, file.originalname || 'unknown.pdf');
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
        documentId: file.originalname || 'unknown.pdf',
        filename: file.originalname || 'unknown.pdf',
        chunks: result.chunks,
        requestId,
      },
    };
  }
}

const uploadPdfApplicationService = new UploadPdfApplicationService();
export default uploadPdfApplicationService;

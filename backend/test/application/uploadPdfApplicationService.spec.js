import { UploadPdfApplicationService } from '../../src/application/upload/UploadPdfApplicationService.js';

describe('UploadPdfApplicationService', () => {
  it('returns a 400 response shape when no file is provided', async () => {
    const service = new UploadPdfApplicationService({
      rag: {
        processPDF: jasmine.createSpy('processPDF'),
      },
    });

    const result = await service.processUpload({
      file: null,
      requestId: 'req_missing',
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('No PDF uploaded');
    expect(result.body.requestId).toBe('req_missing');
  });

  it('processes a PDF and returns the normalized success payload', async () => {
    const rag = {
      processPDF: jasmine.createSpy('processPDF').and.resolveTo({
        success: true,
        chunks: 7,
      }),
    };
    const service = new UploadPdfApplicationService({ rag });

    const result = await service.processUpload({
      file: {
        path: '/tmp/spec.pdf',
        originalname: 'spec.pdf',
      },
      requestId: 'req_upload',
    });

    expect(rag.processPDF).toHaveBeenCalledWith('/tmp/spec.pdf', 'spec.pdf');
    expect(result.statusCode).toBe(200);
    expect(result.body.status).toBe('success');
    expect(result.body.documentId).toBe('spec.pdf');
    expect(result.body.filename).toBe('spec.pdf');
    expect(result.body.chunks).toBe(7);
  });
});

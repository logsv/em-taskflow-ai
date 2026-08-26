import express from 'express';
import supertest from 'supertest';
import sinon from 'sinon';
import uploadRouter from '../../src/routes/upload.js';
import pythonAIServiceClient from '../../src/grpc/client.js';
import sessionApplicationService from '../../src/application/session/SessionApplicationService.js';

describe('Upload Route (Fast-Path Chat Attachment)', () => {
  let app;
  let request;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/chat/upload', uploadRouter);
    request = supertest(app);

    sinon.stub(sessionApplicationService, 'resolveSession').resolves({
      sessionId: 'sess_test',
      threadId: 'th_test',
      created: false,
      cookieValue: null,
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return 400 if no file is provided', async () => {
    const res = await request.post('/api/chat/upload');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  it('should return 200 with extracted text payload for valid file', async () => {
    sinon.stub(pythonAIServiceClient, 'extractDocument').resolves({
      success: true,
      filename: 'sample.csv',
      extracted_text: '# Tabular Data\ncol1,col2\nval1,val2',
      page_count: 1,
      extraction_method: 'pandas_markdown_table',
      error_message: '',
    });

    const res = await request
      .post('/api/chat/upload')
      .attach('file', Buffer.from('col1,col2\nval1,val2'), 'sample.csv');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attachment.filename).toBe('sample.csv');
    expect(res.body.attachment.extractedText).toContain('# Tabular Data');
  });
});

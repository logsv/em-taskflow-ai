import databaseService from '../../src/services/databaseService.js';
import ragService from '../../src/services/ragService.js';
import sinon from 'sinon';

describe('Services Integration Test', () => {
  let databaseStub: sinon.SinonStub;
  let ragStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock database service
    databaseStub = sinon.stub(databaseService, 'getChatHistory').resolves([]);
    
    // Mock RAG service
    ragStub = sinon.stub(ragService, 'getStatus').resolves({
      vectorDB: true,
      embeddingService: true,
      ready: true
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should test databaseService with mock', async () => {
    const history = await databaseService.getChatHistory();
    expect(history).toBeDefined();
    expect(Array.isArray(history)).toBe(true);
    expect(databaseStub.calledOnce).toBe(true);
  });

  it('should test ragService with mock', async () => {
    const status = await ragService.getStatus();
    expect(status).toBeDefined();
    expect(status.ready).toBe(true);
    expect(ragStub.calledOnce).toBe(true);
  });
});
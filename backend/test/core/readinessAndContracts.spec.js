import sinon from 'sinon';
import axios from 'axios';
import { getReadiness, checkModel } from '../../src/application/health/readiness.js';
import pythonAIServiceClient from '../../src/pythonAi/client.js';
import { getCounter, resetMetrics } from '../../src/core/metrics.js';

const ok = async () => ({ status: 'ok' });
const down = async () => ({ status: 'down', error: 'unreachable' });

describe('Readiness', () => {
  it('is ready only when the required dependencies (database, model) are ok', async () => {
    const all = await getReadiness({ database: ok, model: ok, pythonService: ok, redis: ok });
    expect(all.ready).toBeTrue();
    expect(all.status).toBe('ok');

    const optionalDown = await getReadiness({ database: ok, model: ok, pythonService: down, redis: ok });
    expect(optionalDown.ready).toBeTrue();
    expect(optionalDown.status).toBe('degraded');

    const modelDown = await getReadiness({ database: ok, model: down, pythonService: ok, redis: ok });
    expect(modelDown.ready).toBeFalse();
    expect(modelDown.status).toBe('not_ready');
  });

  it('reports the model as down when it is not installed in Ollama', async () => {
    const cfg = { defaultProvider: 'ollama', defaultModel: 'qwen3:8b-q8_0', providers: { ollama: { baseUrl: 'http://ollama:11434' } } };
    const missing = await checkModel(cfg, async () => ({ models: [{ name: 'hermes3:8b' }] }));
    expect(missing.status).toBe('down');
    expect(missing.error).toContain('not installed');

    const present = await checkModel(cfg, async () => ({ models: [{ name: 'qwen3:8b-q8_0' }, { name: 'nomic-embed-text:latest' }] }));
    expect(present.status).toBe('ok');
  });
});

describe('Python AI service response contracts', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    resetMetrics();
  });
  afterEach(() => sandbox.restore());

  it('maps a valid search response', async () => {
    sandbox.stub(axios, 'post').resolves({ data: { results: [{ id: 'c1', content: 'text', filename: 'a.pdf', chunk_index: 0, score: 0.8 }] } });
    const res = await pythonAIServiceClient.searchRAG('q', 3);
    expect(res.length).toBe(1);
    expect(res[0].metadata.filename).toBe('a.pdf');
  });

  it('counts a contract violation instead of silently mis-mapping', async () => {
    sandbox.stub(axios, 'post').resolves({ data: { results: [{ text: 'renamed field', file: 'a.pdf' }] } });
    const res = await pythonAIServiceClient.searchRAG('q', 3);
    expect(res).toEqual([]);
    expect(getCounter('python_contract_violation_total', { endpoint: 'rag/search' })).toBe(1);
  });

  it('does not pass binary files off as text when the extractor is down', async () => {
    sandbox.stub(axios, 'post').rejects(new Error('connect ECONNREFUSED'));
    const pdf = await pythonAIServiceClient.extractDocument(Buffer.from('%PDF-1.7 binary'), 'report.pdf', 'application/pdf');
    expect(pdf.success).toBeFalse();
    expect(pdf.extracted_text).toBe('');
    const txt = await pythonAIServiceClient.extractDocument(Buffer.from('plain notes'), 'notes.txt', 'text/plain');
    expect(txt.success).toBeTrue();
    expect(txt.extracted_text).toBe('plain notes');
  });
});

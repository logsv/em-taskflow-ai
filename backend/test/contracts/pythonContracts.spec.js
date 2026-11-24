/**
 * Cross-service contract tests: the Node client must send exactly the fields the Python
 * service's pydantic request models accept. The models are read from the Python source so
 * a rename on either side fails CI instead of failing silently in production.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildShadowEvalPayload } from '../../src/application/chat/ChatApplicationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTER = path.resolve(__dirname, '../../../services/python-ai-service/app/api/rest_router.py');

/** Parse `class Name(BaseModel):` field declarations from the Python router. */
function pydanticFields(className) {
  const src = fs.readFileSync(ROUTER, 'utf8');
  const start = src.indexOf(`class ${className}(BaseModel):`);
  if (start < 0) throw new Error(`${className} not found in rest_router.py`);
  const body = src.slice(start).split('\n').slice(1);
  const fields = {};
  for (const line of body) {
    if (line.trim() === '') continue;
    if (!/^\s{4}\S/.test(line)) break; // end of the class body
    const m = line.match(/^\s{4}(\w+):\s*([^=]+?)(\s*=.*)?$/);
    if (m) fields[m[1]] = { type: m[2].trim(), required: !m[3] && !m[2].includes('Optional') };
  }
  return fields;
}

describe('Node ↔ Python AI service contracts', () => {
  it('shadow-evaluate payload matches ShadowEvalRequest', () => {
    const fields = pydanticFields('ShadowEvalRequest');
    const payload = buildShadowEvalPayload({ query: 'q', answer: 'a', context: ['c'], traceId: 't', domain: 'dora' });

    expect(Object.keys(payload).sort()).toEqual(Object.keys(fields).sort());
    Object.entries(fields)
      .filter(([, f]) => f.required)
      .forEach(([name]) => expect(payload[name]).withContext(name).toBeDefined());
  });

  it('search and rerank requests use the field names the Python models declare', () => {
    const search = pydanticFields('SearchApiRequest');
    expect(Object.keys(search).sort()).toEqual(['filter_filename', 'query', 'top_k']);
    const rerank = pydanticFields('RerankApiRequest');
    expect(Object.keys(rerank).sort()).toEqual(['candidate_chunks', 'query', 'top_n']);
    const candidate = pydanticFields('CandidateItem');
    expect(Object.keys(candidate).sort()).toEqual(['chunk_index', 'content', 'filename', 'id']);
  });
});

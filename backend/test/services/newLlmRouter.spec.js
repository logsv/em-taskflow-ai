import sinon from 'sinon';
import { testRouter } from '../../src/llm/router.js';

describe('LLM Router basic smoke test', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(console, 'log');
    sandbox.stub(console, 'error');
    sandbox.stub(console, 'warn');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should attempt a router test call and handle failures', async () => {
    const result = await testRouter('test');
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});


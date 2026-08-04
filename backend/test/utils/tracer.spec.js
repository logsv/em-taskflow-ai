import { isDockerEnvironment, resolveLangfuseBaseUrl, getTracerCallbacks, createEndToEndTrace, createSpan } from '../../src/utils/tracer.js';

describe('Tracer Utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should detect docker environment safely', () => {
    const isDocker = isDockerEnvironment();
    expect(typeof isDocker).toBe('boolean');
  });

  it('should resolve langfuse base url based on environment', () => {
    process.env.LANGFUSE_HOST = 'http://custom-langfuse:3000';
    const baseUrl = resolveLangfuseBaseUrl();
    expect(baseUrl).toBe('http://custom-langfuse:3000');
  });

  it('should return undefined callbacks if no keys configured', () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;

    const callbacks = getTracerCallbacks();
    expect(callbacks).toBeUndefined();
  });

  it('should return null trace when LANGFUSE_PUBLIC_KEY is missing', () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const { trace, callbacks } = createEndToEndTrace({ query: 'test query' });
    expect(trace).toBeNull();
    expect(callbacks).toBeUndefined();
  });

  it('should safely handle createSpan on null parent', () => {
    const spanCtrl = createSpan(null, 'Test Span');
    expect(spanCtrl.span).toBeNull();
    expect(() => spanCtrl.end({ output: 'ok' })).not.toThrow();
  });
});

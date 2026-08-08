import sinon from 'sinon';
import { log, info, error, warn, debug, logger } from '../../src/utils/logger.js';

describe('Logger Utils (Pino Structured JSON)', () => {
  let infoSpy;
  let errorSpy;
  let warnSpy;
  let debugSpy;

  beforeEach(() => {
    infoSpy = sinon.spy(logger, 'info');
    errorSpy = sinon.spy(logger, 'error');
    warnSpy = sinon.spy(logger, 'warn');
    debugSpy = sinon.spy(logger, 'debug');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('info & log functions', () => {
    it('should log structured info messages', () => {
      log('Test message');
      
      expect(infoSpy.calledOnce).toBe(true);
      expect(infoSpy.firstCall.args[1]).toBe('Test message');
    });

    it('should handle metadata objects', () => {
      info('User action', { userId: 'u_123' });
      
      expect(infoSpy.calledOnce).toBe(true);
      expect(infoSpy.firstCall.args[0]).toEqual({ userId: 'u_123' });
      expect(infoSpy.firstCall.args[1]).toBe('User action');
    });
  });

  describe('error function', () => {
    it('should log error messages', () => {
      error('Error message', { errCode: 'DB_FAIL' });
      
      expect(errorSpy.calledOnce).toBe(true);
      expect(errorSpy.firstCall.args[0]).toEqual({ errCode: 'DB_FAIL' });
      expect(errorSpy.firstCall.args[1]).toBe('Error message');
    });
  });

  describe('warn function', () => {
    it('should log warning messages', () => {
      warn('Warning message');
      
      expect(warnSpy.calledOnce).toBe(true);
      expect(warnSpy.firstCall.args[1]).toBe('Warning message');
    });
  });

  describe('all logger functions', () => {
    it('should work independently', () => {
      log('Info message');
      error('Error message');
      warn('Warning message');
      
      expect(infoSpy.calledOnce).toBe(true);
      expect(errorSpy.calledOnce).toBe(true);
      expect(warnSpy.calledOnce).toBe(true);
    });
  });
});

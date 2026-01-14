import sinon from 'sinon';
import { log, error, warn } from '../../src/utils/logger.js';

describe('Logger Utils', () => {
  let consoleLogStub;
  let consoleErrorStub;
  let consoleWarnStub;

  beforeEach(() => {
    consoleLogStub = sinon.stub(console, 'log');
    consoleErrorStub = sinon.stub(console, 'error');
    consoleWarnStub = sinon.stub(console, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('log function', () => {
    it('should log messages with INFO prefix', () => {
      log('Test message');
      
      expect(consoleLogStub.calledOnce).toBe(true);
      expect(consoleLogStub.calledWith('[INFO] Test message')).toBe(true);
    });

    it('should handle empty string', () => {
      log('');
      
      expect(consoleLogStub.calledOnce).toBe(true);
      expect(consoleLogStub.calledWith('[INFO] ')).toBe(true);
    });

    it('should handle special characters', () => {
      log('Special chars: !@#$%^&*()');
      
      expect(consoleLogStub.calledOnce).toBe(true);
      expect(consoleLogStub.calledWith('[INFO] Special chars: !@#$%^&*()')).toBe(true);
    });
  });

  describe('error function', () => {
    it('should log error messages with ERROR prefix', () => {
      error('Error message');
      
      expect(consoleErrorStub.calledOnce).toBe(true);
      expect(consoleErrorStub.calledWith('[ERROR] Error message')).toBe(true);
    });

    it('should handle error with stack trace info', () => {
      error('Database connection failed');
      
      expect(consoleErrorStub.calledOnce).toBe(true);
      expect(consoleErrorStub.calledWith('[ERROR] Database connection failed')).toBe(true);
    });
  });

  describe('warn function', () => {
    it('should log warning messages with WARN prefix', () => {
      warn('Warning message');
      
      expect(consoleWarnStub.calledOnce).toBe(true);
      expect(consoleWarnStub.calledWith('[WARN] Warning message')).toBe(true);
    });

    it('should handle deprecation warnings', () => {
      warn('This feature is deprecated');
      
      expect(consoleWarnStub.calledOnce).toBe(true);
      expect(consoleWarnStub.calledWith('[WARN] This feature is deprecated')).toBe(true);
    });
  });

  describe('all logger functions', () => {
    it('should work independently', () => {
      log('Info message');
      error('Error message');
      warn('Warning message');
      
      expect(consoleLogStub.calledOnce).toBe(true);
      expect(consoleErrorStub.calledOnce).toBe(true);
      expect(consoleWarnStub.calledOnce).toBe(true);
    });
  });
});


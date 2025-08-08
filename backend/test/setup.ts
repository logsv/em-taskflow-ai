// Global test setup for ES modules and Jasmine
// This file runs before all tests

import sinon from 'sinon';

// Set up test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ':memory:';

// Increase timeout for async operations
jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

// Mock console methods to reduce noise during testing
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests unless needed
  console.log = () => {};
  console.warn = () => {};
  // Keep error logging for debugging
  console.error = originalConsoleError;
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global mock utilities
(global as any).createMockSandbox = () => sinon.createSandbox();
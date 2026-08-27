import sinon from 'sinon';
import { seedAllTestData } from './fixtures/seedTestData.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://taskflow:taskflow@localhost:5432/taskflow_test';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(async () => {
  console.log = () => {};
  console.warn = () => {};
  console.error = originalConsoleError;

  // Seed in-memory database stores with test fixture data.
  // This replaces the previously hardcoded dummy data that was embedded
  // in production code. Tests now get their data from explicit fixtures.
  try {
    const databaseService = (await import('../src/db/postgres.js')).default;
    seedAllTestData(databaseService);
    await databaseService.initialize().catch(() => {});
  } catch (_e) {
    // Database service may not be available in all test contexts
  }
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

global.createMockSandbox = () => sinon.createSandbox();

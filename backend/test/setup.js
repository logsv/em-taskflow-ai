import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://taskflow:taskflow@localhost:5432/taskflow_test';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = () => {};
  console.warn = () => {};
  console.error = originalConsoleError;
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

global.createMockSandbox = () => sinon.createSandbox();

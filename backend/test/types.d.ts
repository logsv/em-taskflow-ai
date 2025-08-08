/// <reference types="jasmine" />

// Extend global namespace with Jasmine types and additional test utilities
declare global {
  var describe: jasmine.Describe;
  var it: jasmine.It;
  var beforeEach: jasmine.BeforeEach;
  var afterEach: jasmine.AfterEach;
  var beforeAll: jasmine.BeforeAll;
  var afterAll: jasmine.AfterAll;
  var expect: jasmine.Matchers<any>;
  var spyOn: jasmine.Spy;
  var fail: jasmine.Fail;
  var __importStub__: any;
  
  // Add test function for Jest-like syntax
  function test(description: string, fn: () => void | Promise<void>): void;
  
  namespace jasmine {
    interface Matchers<T> {
      resolves: jasmine.AsyncMatchers<T>;
    }
    
    interface AsyncMatchers<T> {
      not: jasmine.AsyncMatchers<T>;
      toThrow(): Promise<void>;
    }
  }
}

export {};
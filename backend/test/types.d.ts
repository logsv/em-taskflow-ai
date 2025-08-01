/// <reference types="jasmine" />

// Extend global namespace with Jasmine types
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
}

export {};
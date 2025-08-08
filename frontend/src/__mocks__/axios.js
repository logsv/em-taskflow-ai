// Mock axios for Jest tests
export default {
  get: jest.fn(() => Promise.resolve({ data: [] })),
  post: jest.fn(() => Promise.resolve({ data: { response: 'Mock response' } })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  create: jest.fn(function () {
    return this;
  }),
  defaults: {
    adapter: {},
    headers: {
      common: {},
      delete: {},
      get: {},
      head: {},
      patch: {},
      post: {},
      put: {}
    }
  },
  interceptors: {
    request: {
      use: jest.fn(),
      eject: jest.fn()
    },
    response: {
      use: jest.fn(),
      eject: jest.fn()
    }
  }
};
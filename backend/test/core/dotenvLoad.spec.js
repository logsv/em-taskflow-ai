import { shouldLoadDotenv } from '../../src/core/dotenvLoad.js';

describe('shouldLoadDotenv', () => {
  it('never reads .env under NODE_ENV=test (specs must not depend on the developer machine)', () => {
    expect(shouldLoadDotenv({ NODE_ENV: 'test' })).toBe(false);
  });

  it('reads .env in development and production', () => {
    expect(shouldLoadDotenv({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldLoadDotenv({ NODE_ENV: 'production' })).toBe(true);
    expect(shouldLoadDotenv({})).toBe(true);
  });
});

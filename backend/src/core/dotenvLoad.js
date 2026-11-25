import dotenv from 'dotenv';

/**
 * Whether to read .env files. Tests (NODE_ENV=test) must not pick up the developer's real
 * backend/.env: its AUTH_TOKEN, keys and URLs would make specs depend on the machine they run on.
 */
export function shouldLoadDotenv(env = process.env) {
  return env.NODE_ENV !== 'test';
}

/** dotenv.config(), skipped under tests. */
export function loadDotenv(options) {
  if (!shouldLoadDotenv()) return { parsed: {} };
  return dotenv.config(options);
}

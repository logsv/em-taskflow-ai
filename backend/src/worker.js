/**
 * Worker process entry point: `npm run worker` (docker compose runs it as the `worker` service).
 * Runs the background workers without the HTTP API.
 */
import { loadDotenv } from './core/dotenvLoad.js';
loadDotenv();

const { validateConfig } = await import('./config.js');
const { default: db } = await import('./db/index.js');
const { startWorkers, stopWorkers } = await import('./workers/runWorkers.js');
const { info, warn, error } = await import('./utils/logger.js');

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  info(`Worker received ${signal}, shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await stopWorkers();
    await Promise.resolve(db.close());
    process.exit(0);
  } catch (err) {
    error('Worker shutdown failed', { err: err.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => error('Worker unhandled rejection', { reason: String(reason) }));

try {
  validateConfig();
  await db.initialize(); // also applies migrations (advisory-locked, safe alongside the API)
} catch (err) {
  // Without the database the workers cannot do anything useful: fail so the container restarts.
  error('Worker could not initialise the database', { err: err.message });
  process.exit(1);
}

const started = await startWorkers();
if (started.length === 0) warn('No background workers started');

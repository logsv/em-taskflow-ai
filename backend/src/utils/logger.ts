// Logger functions with TypeScript types

function log(message: string): void {
  console.log(`[INFO] ${message}`);
}

function error(message: string): void {
  console.error(`[ERROR] ${message}`);
}

function warn(message: string): void {
  console.warn(`[WARN] ${message}`);
}

export { log, error, warn };

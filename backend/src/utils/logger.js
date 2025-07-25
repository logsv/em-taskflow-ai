// Convert from CommonJS to ESM

// Logger functions
function log(message) {
  console.log(`[INFO] ${message}`);
}

function error(message) {
  console.error(`[ERROR] ${message}`);
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

export { log, error, warn };
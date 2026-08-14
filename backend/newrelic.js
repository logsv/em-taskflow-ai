'use strict';
/**
 * New Relic Agent Configuration
 * https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration/
 *
 * Environment variables (set in backend/.env and docker-compose.yml) take
 * precedence over values in this file. This file is still required so the
 * agent can bootstrap in Node.js ESM mode before any ES module is loaded.
 */
exports.config = {
  // ---------------------------------------------------------------------------
  // Core identity
  // ---------------------------------------------------------------------------
  app_name: [process.env.NEW_RELIC_APP_NAME || 'em-taskflow-backend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY || '',

  // ---------------------------------------------------------------------------
  // Logging — write agent logs to stdout (captured by Docker / Dozzle / Axiom)
  // ---------------------------------------------------------------------------
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
    filepath: 'stdout',
  },

  // ---------------------------------------------------------------------------
  // Distributed Tracing (required for modern New Relic APM)
  // ---------------------------------------------------------------------------
  distributed_tracing: {
    enabled: true,
  },

  // ---------------------------------------------------------------------------
  // Transaction traces & slow query capture
  // ---------------------------------------------------------------------------
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f',
    record_sql: 'obfuscated',
    explain_threshold: 500,
  },

  // ---------------------------------------------------------------------------
  // Error collector — capture unhandled exceptions and Promise rejections
  // ---------------------------------------------------------------------------
  error_collector: {
    enabled: true,
    ignore_status_codes: [404],
  },

  // ---------------------------------------------------------------------------
  // Allow the agent to be disabled via NEW_RELIC_ENABLED=false env var
  // ---------------------------------------------------------------------------
  agent_enabled: process.env.NEW_RELIC_ENABLED !== 'false',
};

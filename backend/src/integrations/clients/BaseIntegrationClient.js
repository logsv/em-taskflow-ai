/**
 * BaseIntegrationClient (GoF Adapter / Facade Pattern)
 * Standardizes HTTP communication, timeout handling, circuit breaking,
 * error normalization, and structured leveled JSON logging (Pino).
 */

import axios from 'axios';
import { info, warn, error, debug } from '../../utils/logger.js';

export class BaseIntegrationClient {
  /**
   * @param {string} serviceName - e.g. 'github', 'jira', 'notion', 'gcal', 'slack'
   * @param {number} defaultTimeoutMs - default timeout in milliseconds
   */
  constructor(serviceName, defaultTimeoutMs = 5000) {
    this.serviceName = serviceName;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Safe execution wrapper with timing, structured logging, and error normalization.
   * @template T
   * @param {string} operation - e.g. 'searchIssues', 'getCalendarEvents'
   * @param {() => Promise<T>} fn - async function executing the HTTP call
   * @param {Record<string, any>} context - context metadata for logging
   * @returns {Promise<T>}
   */
  async execute(operation, fn, context = {}) {
    const startTime = Date.now();
    try {
      debug({ module: `${this.serviceName}Client`, action: operation, ...context }, `Executing ${this.serviceName}.${operation}`);
      const result = await fn();
      const durationMs = Date.now() - startTime;
      debug({ module: `${this.serviceName}Client`, action: operation, durationMs }, `${this.serviceName}.${operation} succeeded in ${durationMs}ms`);
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const statusCode = err.response?.status;
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Unknown network error';
      
      warn(
        {
          module: `${this.serviceName}Client`,
          action: operation,
          durationMs,
          statusCode,
          errorMsg,
          ...context,
        },
        `${this.serviceName}.${operation} failed (${statusCode || 'ERR'}): ${errorMsg}`
      );
      throw err;
    }
  }

  /**
   * Performs an HTTP GET request with standard headers and timeout.
   * @param {string} url
   * @param {Record<string, any>} config
   */
  async get(url, config = {}) {
    return axios.get(url, {
      timeout: this.defaultTimeoutMs,
      ...config,
      headers: {
        'User-Agent': 'EM-TaskFlow-AI',
        ...(config.headers || {}),
      },
    });
  }

  /**
   * Performs an HTTP POST request with standard headers and timeout.
   * @param {string} url
   * @param {any} data
   * @param {Record<string, any>} config
   */
  async post(url, data, config = {}) {
    return axios.post(url, data, {
      timeout: this.defaultTimeoutMs,
      ...config,
      headers: {
        'User-Agent': 'EM-TaskFlow-AI',
        ...(config.headers || {}),
      },
    });
  }

  /**
   * Creates a standard configured axios instance with defaults.
   * @param {Record<string, string>} headers
   * @param {number} timeout
   */
  createAxiosInstance(headers = {}, timeout = this.defaultTimeoutMs) {
    return axios.create({
      timeout,
      headers: {
        'User-Agent': 'EM-TaskFlow-AI',
        ...headers,
      },
    });
  }

  /**
   * Standard connection test result formatter.
   * @param {boolean} success
   * @param {string} message
   * @param {Record<string, any>} details
   */
  formatTestResult(success, message, details = {}) {
    return {
      success,
      message,
      service: this.serviceName,
      testedAt: new Date().toISOString(),
      ...details,
    };
  }
}

export default BaseIntegrationClient;

/**
 * EM TaskFlow AI - Centralized Frontend API Client (v1)
 * Standardizes API communication, base path prefixing (/api/v1), and session context injection.
 */

export const API_V1_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '/api/v1';

/**
 * Normalizes an API path to the canonical /api/v1 namespace.
 * @param {string} path - The target path, e.g. '/chat', '/sessions', or '/admin/system-status'
 * @returns {string} Fully qualified URL or relative /api/v1 path
 */
export function apiUrl(path) {
  if (!path) return API_V1_BASE;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // If path already starts with /api/v1, preserve it
  if (path.startsWith('/api/v1/')) {
    return path;
  }
  // If path starts with /api/, replace prefix with /api/v1
  if (path.startsWith('/api/')) {
    return `${API_V1_BASE}${path.slice(4)}`;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_V1_BASE}${cleanPath}`;
}

/**
 * Standard fetch wrapper with automatic header injection and response handling.
 * @param {string} endpoint - Target route or path
 * @param {RequestInit} [options] - Fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = apiUrl(endpoint);
  const headers = { ...options.headers };

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export default {
  API_V1_BASE,
  apiUrl,
  apiFetch,
};

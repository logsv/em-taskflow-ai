import { API_V1_BASE } from '../services/apiClient';

export const AUTH_REQUIRED_EVENT = 'emtf:auth-required';

/**
 * Wrap window.fetch once so any 401 from the API (outside /auth/*) re-opens the login screen,
 * and API calls always carry the session cookie.
 */
export function installAuthFetchInterceptor() {
  if (typeof window === 'undefined' || window.__emtfAuthFetchInstalled) return;
  const originalFetch = window.fetch.bind(window);
  window.__emtfAuthFetchInstalled = true;

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApi = url.startsWith('/api/') || url.startsWith(API_V1_BASE);
    const response = await originalFetch(input, isApi ? { credentials: 'include', ...init } : init);
    if (isApi && response.status === 401 && !url.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    }
    return response;
  };
}

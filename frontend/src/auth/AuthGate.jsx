import React, { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '../services/apiClient';
import { AUTH_REQUIRED_EVENT } from './authEvents';
import './AuthGate.css';

/**
 * Single-owner login gate. Renders children only when the backend reports the request
 * is authenticated (or auth is disabled in development).
 */
export default function AuthGate({ children }) {
  const [state, setState] = useState('checking'); // checking | ok | login | error
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/auth/status'), { credentials: 'include' });
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      const data = await res.json();
      setState(!data.authEnabled || data.authenticated ? 'ok' : 'login');
    } catch (err) {
      setMessage(`Cannot reach the EM TaskFlow backend: ${err.message}`);
      setState('error');
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const onAuthRequired = () => {
      setMessage('Your session has expired. Sign in again.');
      setState('login');
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, [checkStatus]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setToken('');
        setState('ok');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setMessage(res.status === 429 ? 'Too many failed attempts. Try again in 15 minutes.' : data.error || 'Sign-in failed.');
    } catch (err) {
      setMessage(`Sign-in failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'ok') return children;

  return (
    <div className="auth-gate">
      <div className="auth-card" role="dialog" aria-labelledby="auth-title">
        <h1 id="auth-title">EM TaskFlow AI</h1>
        {state === 'checking' && <p className="auth-muted">Checking session…</p>}
        {state === 'error' && (
          <>
            <p className="auth-error">{message}</p>
            <button type="button" className="auth-button" onClick={checkStatus}>Retry</button>
          </>
        )}
        {state === 'login' && (
          <form onSubmit={onSubmit}>
            <label htmlFor="auth-token" className="auth-label">Owner access token</label>
            <input
              id="auth-token"
              type="password"
              autoComplete="current-password"
              className="auth-input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
            />
            <p className="auth-muted">The AUTH_TOKEN value from backend/.env.</p>
            {message && <p className="auth-error" role="alert">{message}</p>}
            <button type="submit" className="auth-button" disabled={submitting || token.length === 0}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthGate from './AuthGate';
import { AUTH_REQUIRED_EVENT } from './authEvents';

function mockFetch(handlers) {
  global.fetch = vi.fn(async (url, init = {}) => {
    const key = `${init.method || 'GET'} ${String(url).replace(/^.*\/api\/v1/, '')}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected fetch ${key}`);
    const { status = 200, body = {} } = handler(init);
    return { ok: status < 400, status, json: async () => body };
  });
}

describe('AuthGate', () => {
  it('renders the app when auth is disabled', async () => {
    mockFetch({ 'GET /auth/status': () => ({ body: { authEnabled: false, authenticated: true } }) });
    render(<AuthGate><div>app content</div></AuthGate>);
    expect(await screen.findByText('app content')).toBeInTheDocument();
  });

  it('asks for the owner token and signs in', async () => {
    mockFetch({
      'GET /auth/status': () => ({ body: { authEnabled: true, authenticated: false } }),
      'POST /auth/login': (init) => (JSON.parse(init.body).token === 'right-token' ? { body: { success: true } } : { status: 401, body: { error: 'Invalid token' } }),
    });
    render(<AuthGate><div>app content</div></AuthGate>);
    const input = await screen.findByLabelText('Owner access token');

    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid token');

    fireEvent.change(input, { target: { value: 'right-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('app content')).toBeInTheDocument();
  });

  it('returns to the login screen when the session expires', async () => {
    mockFetch({ 'GET /auth/status': () => ({ body: { authEnabled: true, authenticated: true } }) });
    render(<AuthGate><div>app content</div></AuthGate>);
    await screen.findByText('app content');
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    await waitFor(() => expect(screen.getByText(/session has expired/)).toBeInTheDocument());
  });

  it('shows an error with retry when the backend is unreachable', async () => {
    global.fetch = vi.fn(async () => { throw new Error('Failed to fetch'); });
    render(<AuthGate><div>app content</div></AuthGate>);
    expect(await screen.findByText(/Cannot reach the EM TaskFlow backend/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

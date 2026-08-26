import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { GithubOAuthProvider, getGithubMcpUrl } from './githubOAuthProvider.js';
import { closeGithubMcp, getGithubTools } from './github.js';
import { getMcpConfig } from '../config.js';
import { warn } from '../utils/logger.js';

export async function startGithubOAuthFlow() {
  const provider = new GithubOAuthProvider();
  const tokens = await provider.tokens();
  if (tokens?.access_token) {
    return {
      status: 'authorized',
      authorizationUrl: null,
    };
  }

  const pending = await provider.getPendingAuthorization();
  const hasVerifier = await provider.hasCodeVerifier();
  if (pending?.url && hasVerifier) {
    return {
      status: 'redirect_required',
      authorizationUrl: pending.url,
    };
  }

  const serverUrl = getGithubMcpUrl();
  let result;
  try {
    result = await auth(provider, { serverUrl });
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('does not support dynamic client registration')) {
      throw new Error(
        'GitHub MCP OAuth requires a pre-registered OAuth client. Set GITHUB_MCP_OAUTH_CLIENT_ID (and GITHUB_MCP_OAUTH_CLIENT_SECRET if issued), then retry /api/mcp/github/oauth/start.',
      );
    }
    throw error;
  }
  if (result === 'AUTHORIZED') {
    return {
      status: 'authorized',
      authorizationUrl: null,
    };
  }

  const updatedPending = await provider.getPendingAuthorization();
  return {
    status: 'redirect_required',
    authorizationUrl: updatedPending?.url || null,
  };
}

export async function completeGithubOAuthFlow(code) {
  if (!code) {
    throw new Error('Missing authorization code');
  }

  const provider = new GithubOAuthProvider();
  const serverUrl = getGithubMcpUrl();
  const result = await auth(provider, {
    serverUrl,
    authorizationCode: code,
  });
  if (result !== 'AUTHORIZED') {
    throw new Error('GitHub OAuth authorization did not complete');
  }

  await closeGithubMcp();
  const tools = await getGithubTools();
  try {
    const mcpModule = await import('./index.js');
    if (typeof mcpModule.reconnectMCP === 'function') {
      await mcpModule.reconnectMCP();
    }
  } catch (error) {
    warn({ module: 'githubOAuth', action: 'reconnectMcp', err: error }, 'Failed to reconnect MCP after GitHub OAuth');
  }
  return {
    status: 'authorized',
    toolCount: tools.length,
  };
}

export async function getGithubOAuthStatus() {
  const provider = new GithubOAuthProvider();
  const pending = await provider.getPendingAuthorization();
  const tokens = await provider.tokens();
  const githubConfig = getMcpConfig().github || {};
  const hasStaticToken = !!(githubConfig.token || process.env.GITHUB_TOKEN);

  let githubToolCount = 0;
  if (tokens?.access_token || hasStaticToken) {
    try {
      const tools = await getGithubTools();
      githubToolCount = tools.length;
    } catch {
      githubToolCount = 0;
    }
  }
  return {
    authorized: !!(tokens?.access_token || hasStaticToken || githubToolCount > 0),
    hasRefreshToken: !!tokens?.refresh_token,
    githubToolCount,
    pendingAuthorizationUrl: pending?.url || null,
  };
}

export async function resetGithubOAuthState() {
  const provider = new GithubOAuthProvider();
  await provider.invalidateCredentials('all');
  await closeGithubMcp();
  return { reset: true };
}

import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { NotionOAuthProvider, getNotionMcpUrl } from './notionOAuthProvider.js';
import { closeNotionMcp, getNotionTools } from './notion.js';

export async function startNotionOAuthFlow() {
  const provider = new NotionOAuthProvider();
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

  const serverUrl = getNotionMcpUrl();
  const result = await auth(provider, { serverUrl });
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

export async function completeNotionOAuthFlow(code) {
  if (!code) {
    throw new Error('Missing authorization code');
  }

  const provider = new NotionOAuthProvider();
  const serverUrl = getNotionMcpUrl();
  const result = await auth(provider, {
    serverUrl,
    authorizationCode: code,
  });
  if (result !== 'AUTHORIZED') {
    throw new Error('Notion OAuth authorization did not complete');
  }

  // Force re-init with fresh tokens and verify tools can be loaded.
  await closeNotionMcp();
  const tools = await getNotionTools();
  try {
    const mcpModule = await import('./index.js');
    if (typeof mcpModule.reconnectMCP === 'function') {
      await mcpModule.reconnectMCP();
    }
  } catch (error) {
    console.warn('⚠️ Failed to reconnect MCP after Notion OAuth:', error?.message || error);
  }
  return {
    status: 'authorized',
    toolCount: tools.length,
  };
}

export async function getNotionOAuthStatus() {
  const provider = new NotionOAuthProvider();
  const pending = await provider.getPendingAuthorization();
  const tokens = await provider.tokens();
  let notionToolCount = 0;
  if (tokens?.access_token) {
    try {
      const tools = await getNotionTools();
      notionToolCount = tools.length;
    } catch (error) {
      notionToolCount = 0;
    }
  }
  return {
    authorized: !!tokens?.access_token,
    hasRefreshToken: !!tokens?.refresh_token,
    notionToolCount,
    pendingAuthorizationUrl: pending?.url || null,
  };
}

export async function resetNotionOAuthState() {
  const provider = new NotionOAuthProvider();
  await provider.invalidateCredentials('all');
  await closeNotionMcp();
  return { reset: true };
}

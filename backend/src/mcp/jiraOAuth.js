import { JiraOAuthProvider, getJiraMcpUrl } from './jiraOAuthProvider.js';
import { closeJiraMcp, getJiraTools } from './jira.js';
import { getMcpConfig } from '../config.js';

export async function startJiraOAuthFlow() {
  const provider = new JiraOAuthProvider();
  const tokens = await provider.tokens();
  if (tokens?.access_token) {
    return {
      status: 'authorized',
      authorizationUrl: null,
    };
  }

  const authorizationUrl = await provider.createAuthorizationUrl();
  return {
    status: 'redirect_required',
    authorizationUrl,
  };
}

export async function completeJiraOAuthFlow(code) {
  if (!code) {
    throw new Error('Missing authorization code');
  }

  const provider = new JiraOAuthProvider();
  const tokens = await provider.exchangeCodeForTokens(code);
  await closeJiraMcp();
  const tools = await getJiraTools();

  try {
    const mcpModule = await import('./index.js');
    if (typeof mcpModule.reconnectMCP === 'function') {
      await mcpModule.reconnectMCP();
    }
  } catch (error) {
    console.warn('⚠️ Failed to reconnect MCP after Jira OAuth:', error?.message || error);
  }

  return {
    status: 'authorized',
    toolCount: tools.length,
    resources: await provider.getAccessibleResources(),
  };
}

export async function getJiraOAuthStatus() {
  const provider = new JiraOAuthProvider();
  const tokens = await provider.tokens();
  const jiraConfig = getMcpConfig().jira || {};
  const hasStaticToken = !!(jiraConfig.apiToken || process.env.JIRA_API_TOKEN);
  const resources = await provider.getAccessibleResources();

  let jiraToolCount = 0;
  if (tokens?.access_token || hasStaticToken) {
    try {
      const tools = await getJiraTools();
      jiraToolCount = tools.length;
    } catch {
      jiraToolCount = 0;
    }
  }

  return {
    authorized: !!(tokens?.access_token || (hasStaticToken && jiraToolCount > 0)),
    mode: tokens?.access_token ? 'oauth_mcp' : (hasStaticToken ? 'static_api_token' : 'offline_snapshot'),
    mcpUrl: getJiraMcpUrl(),
    resources: Array.isArray(resources) ? resources : [],
    toolCount: jiraToolCount,
  };
}

export async function disconnectJiraOAuth() {
  const provider = new JiraOAuthProvider();
  await provider.invalidateCredentials();
  await closeJiraMcp();
  return {
    status: 'disconnected',
    authorized: false,
  };
}

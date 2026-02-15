import db from '../db/index.js';
import { getMcpConfig } from '../config.js';

const TOKENS_KEY = 'mcp.github.oauth.tokens';
const CLIENT_INFO_KEY = 'mcp.github.oauth.clientInfo';
const CODE_VERIFIER_KEY = 'mcp.github.oauth.codeVerifier';
const AUTH_URL_KEY = 'mcp.github.oauth.authorizationUrl';

export function getGithubMcpUrl() {
  const mcpConfig = getMcpConfig();
  return process.env.GITHUB_MCP_URL || mcpConfig.github.url || 'https://api.githubcopilot.com/mcp/';
}

export class GithubOAuthProvider {
  constructor() {
    const mcpConfig = getMcpConfig();
    this.oauthConfig = mcpConfig.github.oauth;
  }

  get redirectUrl() {
    return this.oauthConfig.redirectUrl;
  }

  get clientMetadata() {
    const metadata = {
      redirect_uris: [this.oauthConfig.redirectUrl],
      client_name: this.oauthConfig.clientName,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
    if (this.oauthConfig.scope) {
      metadata.scope = this.oauthConfig.scope;
    }
    return metadata;
  }

  async clientInformation() {
    const stored = await db.getUserPreference(CLIENT_INFO_KEY);
    if (stored?.client_id) {
      return stored;
    }

    // Fallback for auth servers that don't support Dynamic Client Registration.
    if (this.oauthConfig.clientId) {
      return {
        client_id: this.oauthConfig.clientId,
        ...(this.oauthConfig.clientSecret ? { client_secret: this.oauthConfig.clientSecret } : {}),
        redirect_uris: [this.oauthConfig.redirectUrl],
        client_name: this.oauthConfig.clientName,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: this.oauthConfig.clientSecret ? 'client_secret_post' : 'none',
        ...(this.oauthConfig.scope ? { scope: this.oauthConfig.scope } : {}),
      };
    }

    return null;
  }

  async saveClientInformation(clientInformation) {
    await db.setUserPreference(CLIENT_INFO_KEY, clientInformation);
  }

  async tokens() {
    return db.getUserPreference(TOKENS_KEY);
  }

  async saveTokens(tokens) {
    await db.setUserPreference(TOKENS_KEY, tokens);
    if (tokens?.access_token) {
      await db.setUserPreference(CODE_VERIFIER_KEY, null);
      await db.setUserPreference(AUTH_URL_KEY, null);
    }
  }

  async redirectToAuthorization(authorizationUrl) {
    const existing = await db.getUserPreference(AUTH_URL_KEY);
    if (existing?.url) {
      return;
    }
    const url = authorizationUrl.toString();
    await db.setUserPreference(AUTH_URL_KEY, {
      url,
      createdAt: new Date().toISOString(),
    });
    console.log('🔐 GitHub OAuth authorization required. Open this URL in browser:', url);
  }

  async saveCodeVerifier(codeVerifier) {
    const existing = await db.getUserPreference(CODE_VERIFIER_KEY);
    if (existing) {
      return;
    }
    await db.setUserPreference(CODE_VERIFIER_KEY, codeVerifier);
  }

  async codeVerifier() {
    const verifier = await db.getUserPreference(CODE_VERIFIER_KEY);
    if (!verifier) {
      throw new Error('No GitHub OAuth code verifier found. Start OAuth flow first.');
    }
    return verifier;
  }

  async invalidateCredentials(scope) {
    if (scope === 'all' || scope === 'tokens') {
      await db.setUserPreference(TOKENS_KEY, null);
    }
    if (scope === 'all' || scope === 'client') {
      await db.setUserPreference(CLIENT_INFO_KEY, null);
    }
    if (scope === 'all' || scope === 'verifier') {
      await db.setUserPreference(CODE_VERIFIER_KEY, null);
    }
    if (scope === 'all') {
      await db.setUserPreference(AUTH_URL_KEY, null);
    }
  }

  async getPendingAuthorization() {
    return db.getUserPreference(AUTH_URL_KEY);
  }

  async hasCodeVerifier() {
    const verifier = await db.getUserPreference(CODE_VERIFIER_KEY);
    return !!verifier;
  }
}

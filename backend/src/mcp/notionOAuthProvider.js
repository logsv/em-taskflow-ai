import { getMcpConfig } from '../config.js';
import legacyPreferenceRepository from '../persistence/legacy/LegacyPreferenceRepository.js';

const TOKENS_KEY = 'mcp.notion.oauth.tokens';
const CLIENT_INFO_KEY = 'mcp.notion.oauth.clientInfo';
const CODE_VERIFIER_KEY = 'mcp.notion.oauth.codeVerifier';
const AUTH_URL_KEY = 'mcp.notion.oauth.authorizationUrl';

export function getNotionMcpUrl() {
  const mcpConfig = getMcpConfig();
  return process.env.NOTION_MCP_URL || mcpConfig.notion.url || 'https://mcp.notion.com/mcp';
}

export class NotionOAuthProvider {
  constructor() {
    const mcpConfig = getMcpConfig();
    this.oauthConfig = mcpConfig.notion.oauth;
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
    return legacyPreferenceRepository.get(CLIENT_INFO_KEY);
  }

  async saveClientInformation(clientInformation) {
    await legacyPreferenceRepository.set(CLIENT_INFO_KEY, clientInformation);
  }

  async tokens() {
    return legacyPreferenceRepository.get(TOKENS_KEY);
  }

  async saveTokens(tokens) {
    await legacyPreferenceRepository.set(TOKENS_KEY, tokens);
    if (tokens?.access_token) {
      await legacyPreferenceRepository.set(CODE_VERIFIER_KEY, null);
      await legacyPreferenceRepository.set(AUTH_URL_KEY, null);
    }
  }

  async redirectToAuthorization(authorizationUrl) {
    const existing = await legacyPreferenceRepository.get(AUTH_URL_KEY);
    if (existing?.url) {
      return;
    }
    const url = authorizationUrl.toString();
    await legacyPreferenceRepository.set(AUTH_URL_KEY, {
      url,
      createdAt: new Date().toISOString(),
    });
    console.log('🔐 Notion OAuth authorization required. Open this URL in browser:', url);
  }

  async saveCodeVerifier(codeVerifier) {
    const existing = await legacyPreferenceRepository.get(CODE_VERIFIER_KEY);
    if (existing) {
      return;
    }
    await legacyPreferenceRepository.set(CODE_VERIFIER_KEY, codeVerifier);
  }

  async codeVerifier() {
    const verifier = await legacyPreferenceRepository.get(CODE_VERIFIER_KEY);
    if (!verifier) {
      throw new Error('No Notion OAuth code verifier found. Start OAuth flow first.');
    }
    return verifier;
  }

  async invalidateCredentials(scope) {
    if (scope === 'all' || scope === 'tokens') {
      await legacyPreferenceRepository.set(TOKENS_KEY, null);
    }
    if (scope === 'all' || scope === 'client') {
      await legacyPreferenceRepository.set(CLIENT_INFO_KEY, null);
    }
    if (scope === 'all' || scope === 'verifier') {
      await legacyPreferenceRepository.set(CODE_VERIFIER_KEY, null);
    }
    if (scope === 'all') {
      await legacyPreferenceRepository.set(AUTH_URL_KEY, null);
    }
  }

  async getPendingAuthorization() {
    return legacyPreferenceRepository.get(AUTH_URL_KEY);
  }

  async hasCodeVerifier() {
    const verifier = await legacyPreferenceRepository.get(CODE_VERIFIER_KEY);
    return !!verifier;
  }
}

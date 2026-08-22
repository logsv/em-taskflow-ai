import axios from 'axios';
import crypto from 'crypto';
import { getMcpConfig } from '../config.js';
import legacyPreferenceRepository from '../persistence/legacy/LegacyPreferenceRepository.js';
import settingsService from '../services/settingsService.js';

const TOKENS_KEY = 'mcp.jira.oauth.tokens';
const CLIENT_INFO_KEY = 'mcp.jira.oauth.clientInfo';
const CODE_VERIFIER_KEY = 'mcp.jira.oauth.codeVerifier';
const AUTH_URL_KEY = 'mcp.jira.oauth.authorizationUrl';
const ACCESSIBLE_RESOURCES_KEY = 'mcp.jira.oauth.accessibleResources';

export function getJiraMcpUrl() {
  const mcpConfig = getMcpConfig();
  return process.env.JIRA_MCP_URL || mcpConfig.jira?.mcpUrl || 'https://mcp.atlassian.com/v1/mcp/authv2';
}

export class JiraOAuthProvider {
  get oauthConfig() {
    const cached = settingsService.getCachedSettings()?.mcp?.jira?.oauth || {};
    const mcpConfig = getMcpConfig().jira?.oauth || {};
    return {
      clientId: cached.clientId || process.env.JIRA_OAUTH_CLIENT_ID || mcpConfig.clientId || '',
      clientSecret: cached.clientSecret || process.env.JIRA_OAUTH_CLIENT_SECRET || mcpConfig.clientSecret || '',
      redirectUrl: cached.redirectUrl || process.env.JIRA_OAUTH_REDIRECT_URL || mcpConfig.redirectUrl || 'http://localhost:5001/api/mcp/jira/oauth/callback',
      scope: cached.scope || mcpConfig.scope || 'read:jira-work read:jira-user offline_access',
    };
  }

  get redirectUrl() {
    return this.oauthConfig.redirectUrl || 'http://localhost:5001/api/mcp/jira/oauth/callback';
  }

  generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
  }

  generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  async clientInformation() {
    const stored = await legacyPreferenceRepository.get(CLIENT_INFO_KEY);
    if (stored?.client_id) {
      return stored;
    }

    if (this.oauthConfig.clientId) {
      return {
        client_id: this.oauthConfig.clientId,
        ...(this.oauthConfig.clientSecret ? { client_secret: this.oauthConfig.clientSecret } : {}),
        redirect_uris: [this.redirectUrl],
        scope: this.oauthConfig.scope,
      };
    }

    return null;
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
      // Fetch accessible resources (Jira Cloud ID and domain)
      await this.fetchAndSaveAccessibleResources(tokens.access_token).catch(() => {});
    }
  }

  async fetchAndSaveAccessibleResources(accessToken) {
    try {
      const res = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        timeout: 5000,
      });
      const resources = Array.isArray(res.data) ? res.data : [];
      if (resources.length > 0) {
        await legacyPreferenceRepository.set(ACCESSIBLE_RESOURCES_KEY, resources);
        console.log(`🔷 Atlassian OAuth: Resolved ${resources.length} accessible Cloud resource(s):`, resources.map((r) => `${r.name} (${r.url})`));
      }
      return resources;
    } catch (err) {
      console.warn('⚠️ Failed to fetch Atlassian accessible resources:', err?.message || err);
      return [];
    }
  }

  async getAccessibleResources() {
    return (await legacyPreferenceRepository.get(ACCESSIBLE_RESOURCES_KEY)) || [];
  }

  async createAuthorizationUrl() {
    const clientInfo = await this.clientInformation();
    const clientId = clientInfo?.client_id || this.oauthConfig.clientId;
    if (!clientId) {
      throw new Error('Missing Atlassian OAuth Client ID. Configure JIRA_OAUTH_CLIENT_ID in settings or environment.');
    }

    const verifier = this.generateCodeVerifier();
    const challenge = this.generateCodeChallenge(verifier);
    await legacyPreferenceRepository.set(CODE_VERIFIER_KEY, verifier);

    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = new URL('https://auth.atlassian.com/authorize');
    authUrl.searchParams.set('audience', 'api.atlassian.com');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', this.oauthConfig.scope || 'read:jira-work read:jira-user offline_access');
    authUrl.searchParams.set('redirect_uri', this.redirectUrl);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const urlString = authUrl.toString();
    await legacyPreferenceRepository.set(AUTH_URL_KEY, { url: urlString, state, createdAt: new Date().toISOString() });
    return urlString;
  }

  async exchangeCodeForTokens(code) {
    const clientInfo = await this.clientInformation();
    const clientId = clientInfo?.client_id || this.oauthConfig.clientId;
    const clientSecret = clientInfo?.client_secret || this.oauthConfig.clientSecret;
    const verifier = await legacyPreferenceRepository.get(CODE_VERIFIER_KEY);

    if (!clientId) {
      throw new Error('Missing Atlassian OAuth Client ID');
    }

    const payload = {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: this.redirectUrl,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      ...(verifier ? { code_verifier: verifier } : {}),
    };

    const res = await axios.post('https://auth.atlassian.com/oauth/token', payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });

    const tokens = res.data;
    if (!tokens || !tokens.access_token) {
      throw new Error('Atlassian OAuth token exchange returned invalid payload');
    }

    await this.saveTokens(tokens);
    return tokens;
  }

  async getPendingAuthorization() {
    return legacyPreferenceRepository.get(AUTH_URL_KEY);
  }

  async invalidateCredentials() {
    await legacyPreferenceRepository.set(TOKENS_KEY, null);
    await legacyPreferenceRepository.set(CODE_VERIFIER_KEY, null);
    await legacyPreferenceRepository.set(AUTH_URL_KEY, null);
    await legacyPreferenceRepository.set(ACCESSIBLE_RESOURCES_KEY, null);
  }
}

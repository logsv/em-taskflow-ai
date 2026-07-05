import db from '../../db/index.js';
import agentService from '../../services/agentService.js';
import {
  startNotionOAuthFlow,
  getNotionOAuthStatus,
} from '../../mcp/notionOAuth.js';
import {
  startGithubOAuthFlow,
  getGithubOAuthStatus,
} from '../../mcp/githubOAuth.js';

export class ChatApplicationService {
  constructor({
    dbService = db,
    agent = agentService,
    notionOAuth = {
      start: startNotionOAuthFlow,
      status: getNotionOAuthStatus,
    },
    githubOAuth = {
      start: startGithubOAuthFlow,
      status: getGithubOAuthStatus,
    },
  } = {}) {
    this.db = dbService;
    this.agentService = agent;
    this.notionOAuth = notionOAuth;
    this.githubOAuth = githubOAuth;
  }

  async processChat({ message, threadId = null, sessionContext = null, requestId = null, ragMode = 'baseline' }) {
    const query = String(message || '');
    const ensuredThread = await this.db.ensureThread(
      threadId || sessionContext?.threadId || undefined,
      query.slice(0, 80),
      sessionContext?.sessionId || null,
    );
    const result = await this.agentService.processQuery(query, {
      threadId: ensuredThread.id,
      ragMode,
    });

    const notionOAuth = await this.resolveNotionOAuth();
    const githubOAuth = await this.resolveGithubOAuth();

    const routedDomains = Array.isArray(result?.meta?.decision?.routingPlan?.domains)
      ? result.meta.decision.routingPlan.domains
      : [];
    const githubIntent = routedDomains.includes('github');
    const notionIntent = routedDomains.includes('notion');
    if (githubIntent && githubOAuth?.required) {
      result.answer = githubOAuth.authorizationUrl
        ? 'GitHub connection is required before I can fetch your repositories/issues/PRs. Use the Connect GitHub link in chat, then retry your query.'
        : `GitHub connection is required before I can fetch your repositories/issues/PRs. ${githubOAuth.error || 'Complete GitHub OAuth setup and retry.'}`;
    } else if (notionIntent && notionOAuth?.required) {
      result.answer = 'Notion connection is required before I can fetch workspace insights. Use the Connect Notion link in chat, then retry your query.';
    } else if (notionIntent && notionOAuth?.startError && !notionOAuth?.required) {
      result.answer = `Notion connection is required before I can fetch workspace insights. ${notionOAuth.startError}`;
    }

    const decision = result.meta?.decision || {};
    const sources = Array.isArray(result.sources)
      ? result.sources.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        }))
      : [];

    const userMessageRecord = await this.db.saveMessage({
      threadId: ensuredThread.id,
      role: 'user',
      content: query,
      strategy: decision.selectedPath || null,
      executorPath: decision.selectedPath || null,
      traceId: result.meta?.traceId || null,
      metadata: decision,
    });
    const assistantMessageRecord = await this.db.saveMessage({
      threadId: ensuredThread.id,
      role: 'assistant',
      content: result.answer,
      strategy: decision.selectedPath || null,
      executorPath: decision.selectedPath || null,
      traceId: result.meta?.traceId || null,
      citations: sources,
      metadata: {
        ...decision,
        userMessageId: userMessageRecord.id,
        sourceCount: sources.length,
      },
    });

    return {
      messageId: assistantMessageRecord.id,
      threadId: ensuredThread.id,
      sessionId: sessionContext?.sessionId || null,
      answer: result.answer,
      sources,
      traceId: result.meta?.traceId || null,
      feedbackToken: assistantMessageRecord.id,
      meta: {
        ...(result.meta || {}),
        ...(notionOAuth?.required ? { notionOAuth: { required: true, authorizationUrl: notionOAuth.authorizationUrl } } : {}),
        ...(githubOAuth?.required
          ? {
              githubOAuth: {
                required: true,
                authorizationUrl: githubOAuth.authorizationUrl || null,
                ...(githubOAuth.error ? { error: githubOAuth.error } : {}),
              },
            }
          : {}),
      },
      requestId,
    };
  }

  async resolveNotionOAuth() {
    let startError = null;
    try {
      let oauthStatus = await this.notionOAuth.status();
      if (!oauthStatus?.authorized && !oauthStatus?.pendingAuthorizationUrl) {
        await this.notionOAuth.start().catch((error) => {
          startError = error?.message || String(error);
          return null;
        });
        oauthStatus = await this.notionOAuth.status();
      }
      if (oauthStatus?.pendingAuthorizationUrl && !oauthStatus?.authorized) {
        return {
          required: true,
          authorizationUrl: oauthStatus.pendingAuthorizationUrl,
          startError,
        };
      }
      return {
        required: false,
        authorizationUrl: null,
        startError,
      };
    } catch (error) {
      return null;
    }
  }

  async resolveGithubOAuth() {
    let startError = null;
    try {
      let oauthStatus = await this.githubOAuth.status();
      if (!oauthStatus?.authorized && !oauthStatus?.pendingAuthorizationUrl) {
        await this.githubOAuth.start().catch((error) => {
          startError = error?.message || String(error);
          return null;
        });
        oauthStatus = await this.githubOAuth.status();
      }
      if (oauthStatus?.pendingAuthorizationUrl && !oauthStatus?.authorized) {
        return {
          required: true,
          authorizationUrl: oauthStatus.pendingAuthorizationUrl,
          error: null,
        };
      }
      if (!oauthStatus?.authorized && startError) {
        return {
          required: true,
          authorizationUrl: null,
          error: startError,
        };
      }
      return {
        required: false,
        authorizationUrl: null,
        error: null,
      };
    } catch (error) {
      return null;
    }
  }
}

const chatApplicationService = new ChatApplicationService();
export default chatApplicationService;

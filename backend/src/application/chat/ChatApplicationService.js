import agentService from '../../services/agentService.js';
import threadRepository from '../../persistence/thread/ThreadRepository.js';
import messageRepository from '../../persistence/message/MessageRepository.js';
import {
  startNotionOAuthFlow,
  getNotionOAuthStatus,
} from '../../mcp/notionOAuth.js';
import {
  startGithubOAuthFlow,
  getGithubOAuthStatus,
} from '../../mcp/githubOAuth.js';

import preRouterRewriter from '../../services/preRouterRewriter.js';
import episodicMemoryService from '../../services/episodicMemory.js';

export class ChatApplicationService {
  constructor({
    threadRepo = null,
    messageRepo = null,
    dbService = null,
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
    this.threadRepo = threadRepo || createThreadRepoAdapter(dbService);
    this.messageRepo = messageRepo || createMessageRepoAdapter(dbService);
    this.agentService = agent;
    this.notionOAuth = notionOAuth;
    this.githubOAuth = githubOAuth;
  }

  normalizeAttachments(message = '', attachments = []) {
    if (Array.isArray(attachments) && attachments.length > 0) {
      return attachments;
    }
    const q = String(message);
    const parsed = [];
    const match = q.match(/\[Attachment:\s*([^\]]+)\]/i) || q.match(/# Document Executive Context:\s*([^\n]+)/i);
    if (match) {
      parsed.push({
        filename: match[1].trim(),
        content: q,
      });
    }
    return parsed;
  }

  async processChat({ message, attachments = [], threadId = null, sessionContext = null, requestId = null, ragMode = 'baseline' }) {
    const query = String(message || '');
    const normalizedAttachments = this.normalizeAttachments(query, attachments);

    const ensuredThread = await this.threadRepo.ensureThread(
      threadId || sessionContext?.threadId || undefined,
      query.slice(0, 80),
      sessionContext?.sessionId || null,
    );
    const existingMessages = ensuredThread?.id
      ? await Promise.resolve(this.messageRepo.getThreadMessages(ensuredThread.id, 50)).catch(() => [])
      : [];
    const historyContext = optimizeChatHistory(existingMessages, 8);

    // Tier 1: Non-invasive Coreference & Follow-Up Context Resolution
    const { rewrittenQuery, wasRewritten, entities: extractedEntities } = preRouterRewriter.resolveQuery(query, existingMessages);
    const queryToProcess = wasRewritten ? rewrittenQuery : query;

    // Tier 4: Episodic Memory Retrieval for past references outside active window (0 extra DB queries)
    const episodicPastContext = await episodicMemoryService.retrieveRelevantPastContext(queryToProcess, ensuredThread?.id, 2, existingMessages).catch(() => []);

    const result = await this.agentService.processQuery(queryToProcess, {
      threadId: ensuredThread.id,
      sessionId: sessionContext?.sessionId || null,
      userId: sessionContext?.userId || 'default_user',
      ragMode,
      attachments: normalizedAttachments,
      history: historyContext,
      entities: extractedEntities,
      episodicContext: episodicPastContext,
    });

    const decision = result.meta?.decision || {};
    const routingPlan = decision.routingPlan || {};
    const routedDomains = Array.isArray(routingPlan.domains) ? routingPlan.domains : [];

    let notionOAuth = null;
    let githubOAuth = null;
    const requiresToolAuth = routingPlan.must_use_tools !== false && (routedDomains.includes('github') || routedDomains.includes('notion'));
    if (requiresToolAuth) {
      notionOAuth = await this.resolveNotionOAuth();
      githubOAuth = await this.resolveGithubOAuth();

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
    }

    const sources = Array.isArray(result.sources)
      ? result.sources.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        }))
      : [];

    const userMessageRecord = await this.messageRepo.saveMessage({
      threadId: ensuredThread.id,
      role: 'user',
      content: query,
      strategy: decision.selectedPath || null,
      executorPath: decision.selectedPath || null,
      traceId: result.meta?.traceId || null,
      metadata: decision,
    });
    const assistantMessageRecord = await this.messageRepo.saveMessage({
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

    // Update thread title from default 'New Chat' to concise query-derived title
    const shortTitle = generateShortChatTitle(query, routedDomains);
    if (ensuredThread?.id && (!ensuredThread.title || ensuredThread.title === 'New Chat' || ensuredThread.title === 'Chat')) {
      if (typeof this.threadRepo?.updateThreadTitle === 'function') {
        await Promise.resolve(this.threadRepo.updateThreadTitle(ensuredThread.id, shortTitle)).catch(() => {});
      }
    }

    // Trigger Non-Blocking Online Continuous Shadow Evaluation Worker (5% Traffic Sampling)
    this.triggerShadowEvaluation({
      query,
      answer: result.answer,
      context: sources.map((s) => s.content || s.pageContent || (typeof s === 'string' ? s : '')).filter(Boolean),
      traceId: result.meta?.traceId || null,
      domain: routedDomains[0] || 'general',
    });

    return {
      messageId: assistantMessageRecord.id,
      threadId: ensuredThread.id,
      threadTitle: shortTitle,
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

  triggerShadowEvaluation({ query, answer, context = [], traceId = null, domain = 'general' }) {
    // Non-blocking zero-downtime execution
    setImmediate(async () => {
      try {
        const pythonHost = process.env.PYTHON_AI_SERVICE_URL || 'http://localhost:8000';
        await fetch(`${pythonHost}/api/v1/eval/shadow-evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_query: query,
            model_response: answer,
            retrieved_chunks: context,
            trace_id: traceId,
            domain_category: domain,
          }),
        });
      } catch (err) {
        // Non-blocking catch
      }
    });
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
      return { required: false, authorizationUrl: null, error: null };
    }
  }
}

const chatApplicationService = new ChatApplicationService();
export default chatApplicationService;

function createThreadRepoAdapter(dbService) {
  if (!dbService) {
    return threadRepository;
  }

  return {
    ensureThread: (...args) => dbService.ensureThread(...args),
    updateThreadTitle: (...args) => (typeof dbService.updateThreadTitle === 'function' ? dbService.updateThreadTitle(...args) : null),
  };
}

function createMessageRepoAdapter(dbService) {
  if (!dbService) {
    return messageRepository;
  }

  return {
    saveMessage: (...args) => dbService.saveMessage(...args),
    getThreadMessages: (...args) => (typeof dbService.getThreadMessages === 'function' ? dbService.getThreadMessages(...args) : []),
  };
}

/**
 * Sliding Window + State Anchoring for Chat History with Progressive Disclosure Condensation
 * Keeps the latest N turns active, compressing older turns and collapsing <details> accordions.
 */
export function optimizeChatHistory(messages = [], maxActiveTurns = 8) {
  if (!Array.isArray(messages)) {
    return [];
  }

  // Condense older assistant accordion blocks (<details>...</details>) in working memory to save tokens
  const processedMessages = messages.map((m, idx) => {
    if (m.role === 'assistant' && typeof m.content === 'string' && idx < messages.length - 2) {
      const condensed = m.content.replace(/<details>[\s\S]*?<summary><b>(.*?)<\/b><\/summary>[\s\S]*?<\/details>/gi, '[Collapsed Section: $1]');
      return { ...m, content: condensed };
    }
    return m;
  });

  if (processedMessages.length <= maxActiveTurns + 2) {
    return processedMessages;
  }

  const activeMessages = processedMessages.slice(-maxActiveTurns);
  const olderMessages = processedMessages.slice(0, -maxActiveTurns);

  const keyTopics = olderMessages
    .filter((m) => m.role === 'user')
    .map((m) => String(m.content || '').slice(0, 40))
    .filter(Boolean)
    .slice(-4);

  const summaryAnchor = {
    role: 'system',
    content: `[System Memory: Conversation Summary Anchor]\nPrior topics discussed in this session: ${keyTopics.join(' | ')}. (${olderMessages.length} earlier turns archived)`,
  };

  return [summaryAnchor, ...activeMessages];
}

/**
 * Derives a clean, concise short chat header (<=40 chars) from the user query or domain intent.
 */
export function generateShortChatTitle(query, domains = []) {
  if (!query || typeof query !== 'string') return 'New Chat';

  // Strip file executive summaries, attachments, or system markdown
  let clean = query
    .replace(/\[Attachment:\s*[^\]]+\]/gi, '')
    .replace(/# Document Executive Context:[^\n]+/gi, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .trim();

  // Strip conversational filler prefixes
  clean = clean
    .replace(/^(can\s+you\s+(please\s+)?(tell\s+me\s+about|provide|give|generate|show|analyze|summarize|evaluate|draft|create|help\s+me\s+with)\s+)/i, '')
    .replace(/^(please\s+(provide|give|generate|show|analyze|summarize|evaluate|draft|create|help\s+me\s+with)\s+)/i, '')
    .replace(/^(what\s+is\s+the|what\s+are\s+the|how\s+to|how\s+do\s+I|tell\s+me\s+about|give\s+me\s+(the\s+)?|i\s+need\s+(to\s+)?|i\s+want\s+(to\s+)?)\s+/i, '')
    .trim();

  // If empty after stripping filler, fallback to domains or initial slice
  if (!clean) {
    if (Array.isArray(domains) && domains.length > 0) {
      const d = domains[0];
      const domainLabels = {
        dora: 'DORA Metrics Audit',
        delivery: 'Delivery Bottlenecks',
        sbi: 'SBI Feedback Generator',
        people: 'Personnel Growth & 1-on-1s',
        sprint: 'Sprint Capacity Planning',
        retro: 'Sprint Retrospective',
        roadmap: 'Roadmap Alignment',
        okr: 'OKR Progress Review',
        sop: 'SOP Compliance & On-Call',
        critic: 'Executive Report Audit',
      };
      if (domainLabels[d]) return domainLabels[d];
    }
    return query.slice(0, 36).trim() || 'New Chat';
  }

  // Capitalize the first letter
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);

  // Truncate cleanly at word boundary up to 40 chars
  if (clean.length > 40) {
    const cut = clean.slice(0, 38);
    const lastSpace = cut.lastIndexOf(' ');
    clean = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim() + '…';
  }

  return clean;
}


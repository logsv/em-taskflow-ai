/**
 * Tier 1: Contextual Query Rewriter & Coreference Resolution
 * Resolves anaphoras and relative pronouns ("that PR", "the author", "his OKRs")
 * against recent conversation turns before routing to ensure standalone, unambiguous prompts.
 */

const COREFERENCE_PATTERNS = [
  /\b(that|this|the|said)\s+(pr|pull request|issue|commit)\b/i,
  /\b(the author|the engineer|that engineer|this engineer|the developer|his|her|their)\b/i,
  /\b(that|this|the|same)\s+(sprint|retro|team|repo|repository|objective|okr)\b/i,
  /\b(these|those|the same)\s+(metrics|bottlenecks|violations)\b/i,
  /\bwhat about (him|her|them|it)\b/i,
];

export class PreRouterRewriter {
  /**
   * Resolves follow-up queries against recent history into a standalone query.
   * @param {string} query
   * @param {Array} history
   * @returns {{ rewrittenQuery: string, wasRewritten: boolean, entities: Object }}
   */
  resolveQuery(query = '', history = []) {
    const rawQuery = String(query || '').trim();
    if (!rawQuery) {
      return { rewrittenQuery: '', wasRewritten: false, entities: {} };
    }

    // Fast-path: Check if any coreference pattern matches
    const hasCoreference = COREFERENCE_PATTERNS.some((pattern) => pattern.test(rawQuery));
    if (!hasCoreference || !Array.isArray(history) || history.length === 0) {
      return { rewrittenQuery: rawQuery, wasRewritten: false, entities: {} };
    }

    const entities = this.extractEntitiesFromHistory(history);
    if (Object.keys(entities).length === 0) {
      return { rewrittenQuery: rawQuery, wasRewritten: false, entities: {} };
    }

    let rewritten = rawQuery;
    let modified = false;

    // 1. Resolve PR / Issue references
    if (entities.prNumber && /\b(that|this|the)\s+(pr|pull request)\b/i.test(rewritten)) {
      rewritten = rewritten.replace(
        /\b(that|this|the)\s+(pr|pull request)\b/gi,
        `PR #${entities.prNumber}${entities.repo ? ` in ${entities.repo}` : ''}`
      );
      modified = true;
    }

    // 2. Resolve Author / Engineer references
    if (entities.author && /\b(the author|that engineer|this engineer|the engineer)\b/i.test(rewritten)) {
      rewritten = rewritten.replace(
        /\b(the author|that engineer|this engineer|the engineer)\b/gi,
        `${entities.author}${entities.prNumber ? ` (author of PR #${entities.prNumber})` : ''}`
      );
      modified = true;
    } else if (entities.author && /\b(his|her|their)\s+(feedback|coaching|sbi|okrs?|growth|review)\b/i.test(rewritten)) {
      rewritten = rewritten.replace(
        /\b(his|her|their)\s+(feedback|coaching|sbi|okrs?|growth|review)\b/gi,
        `${entities.author}'s $2`
      );
      modified = true;
    }

    // 3. Resolve Team references
    if (entities.teamId && /\b(that|this|the same)\s+team\b/i.test(rewritten)) {
      rewritten = rewritten.replace(/\b(that|this|the same)\s+team\b/gi, `team '${entities.teamId}'`);
      modified = true;
    }

    // 4. Resolve Sprint references
    if (entities.sprintId && /\b(that|this|the current|the same)\s+sprint\b/i.test(rewritten)) {
      rewritten = rewritten.replace(/\b(that|this|the current|the same)\s+sprint\b/gi, entities.sprintId);
      modified = true;
    }

    return {
      rewrittenQuery: rewritten,
      wasRewritten: modified,
      entities,
    };
  }

  /**
   * Scans the latest 4 history messages to extract active entity anchors.
   */
  extractEntitiesFromHistory(history = []) {
    const entities = {};
    const recent = history.slice(-4).reverse();

    for (const msg of recent) {
      const text = typeof msg === 'string' ? msg : String(msg.content || '');
      if (!text) continue;

      // Extract PR number (#123 or PR 123)
      if (!entities.prNumber) {
        const prMatch = text.match(/(?:PR\s*#?|#)(\d{1,6})/i);
        if (prMatch) {
          entities.prNumber = prMatch[1];
        }
      }

      // Extract Engineer / Author
      if (!entities.author) {
        const authorMatch =
          text.match(/(?:author|engineer|assignee|developer):\s*[`*"]?([a-zA-Z0-9_\-\.]+)[`*"]?/i) ||
          text.match(/(?:for engineer|feedback for)\s*[`*"]?([a-zA-Z0-9_\-\.]+)[`*"]?/i) ||
          text.match(/\b(eng_\d{1,4}|[A-Z][a-z]+ [A-Z][a-z]+)\b/);
        if (authorMatch && !['PR', 'DORA', 'OKR', 'SBI', 'HIGH', 'LOW', 'MEDIUM', 'ELITE'].includes(authorMatch[1])) {
          entities.author = authorMatch[1];
        }
      }

      // Extract Repo
      if (!entities.repo) {
        const repoMatch = text.match(/([a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+)/);
        if (repoMatch && repoMatch[1].includes('/') && !repoMatch[1].startsWith('http')) {
          entities.repo = repoMatch[1];
        }
      }

      // Extract Team
      if (!entities.teamId) {
        const teamMatch = text.match(/(?:team|squad)\s*['"`]?([a-zA-Z0-9_\-\s]+?)['"`]?(?:\s+metrics|\s+DORA|\.|\n|$)/i);
        if (teamMatch && teamMatch[1].trim().length < 40) {
          entities.teamId = teamMatch[1].trim();
        }
      }

      // Extract Sprint ID
      if (!entities.sprintId) {
        const sprintMatch = text.match(/(Sprint\s*\d{1,4})/i);
        if (sprintMatch) {
          entities.sprintId = sprintMatch[1];
        }
      }
    }

    return entities;
  }
}

const preRouterRewriter = new PreRouterRewriter();
export default preRouterRewriter;

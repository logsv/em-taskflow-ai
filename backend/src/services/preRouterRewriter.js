/**
 * Tier 1: Contextual Query Rewriter & Coreference Resolution
 * Resolves anaphoras and relative pronouns ("that PR", "the author", "his OKRs", "him",
 * "that same service") against recent conversation turns before routing, so the router
 * sees a standalone, unambiguous prompt.
 *
 * Entity keys (shared with the golden dataset's `expected_entities`):
 *   engineer, pr ("#142"), repository, team, sprint, metric
 */

const COREFERENCE_PATTERNS = [
  /\b(that|this|the|said)\s+(pr|pull request|issue|commit)\b/i,
  /\b(the author|the engineer|that engineer|this engineer|the developer|his|her|their|him)\b/i,
  /\b(that|this|the|same)\s+(sprint|retro|team|repo|repository|service|objective|okr)\b/i,
  /\b(these|those|the same)\s+(metrics|bottlenecks|violations)\b/i,
  /\bwhat about (him|her|them|it)\b/i,
];

// Capitalised pairs that look like a person's name but are not.
const NON_PERSON_SECOND_WORDS = new Set([
  'Calendar', 'Tier', 'Core', 'Request', 'Requests', 'Decision', 'Record', 'Review', 'Board', 'Team', 'Sprint',
]);
const NON_PERSON_FIRST_WORDS = new Set(['Engineer', 'Developer', 'Senior', 'Staff', 'Principal', 'Lead', 'Manager', 'Team', 'Sprint']);
const NON_PERSON_WORDS = new Set(['PR', 'DORA', 'OKR', 'SBI', 'HIGH', 'LOW', 'MEDIUM', 'ELITE']);

const SERVICE_PATTERN = /\b([a-z0-9]+(?:-[a-z0-9]+)*-(?:service|backend|frontend|api|gateway|web|app|worker|ui))\b/;
const TIME_UNITS = /^(?:week|day|month|hour|year|sprint|deploy)s?$/i;

function messageText(msg) {
  return typeof msg === 'string' ? msg : String(msg?.content || '');
}

function isPersonName(name) {
  if (!name || NON_PERSON_WORDS.has(name.toUpperCase()) || SERVICE_PATTERN.test(name)) return false;
  const parts = name.split(' ');
  return !(parts.length === 2 && (NON_PERSON_FIRST_WORDS.has(parts[0]) || NON_PERSON_SECOND_WORDS.has(parts[1])));
}

/** Engineer patterns, strongest first. A stronger pattern in any recent turn wins over a weaker one. */
const ENGINEER_PATTERNS = [
  /(?:author|engineer|assignee|developer):\s*[`*"]?([a-zA-Z0-9_\-.]+)[`*"]?/i,
  /(?:for engineer|feedback for)\s+[`*"]?([a-zA-Z0-9_\-.]+)[`*"]?/i,
  /\bfor\s+([a-z][a-z0-9]*[-_][a-z0-9_-]*[a-z0-9])\b/, // handles such as alex-dev
  /\b(eng_\d{1,4})\b/,
  /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // full names; filtered by isPersonName
  /\b(?:[Ee]ngineer|[Dd]eveloper)\s+([A-Z][a-z]+)\b/,
];

function findEngineer(texts) {
  for (const pattern of ENGINEER_PATTERNS) {
    for (const text of texts) {
      if (pattern.global) {
        for (const m of text.matchAll(pattern)) {
          if (isPersonName(m[1])) return m[1];
        }
      } else {
        const m = text.match(pattern);
        if (m && isPersonName(m[1])) return m[1];
      }
    }
  }
  return null;
}

function findFirst(texts, extract) {
  for (const text of texts) {
    const value = extract(text);
    if (value) return value;
  }
  return null;
}

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
    if (!Array.isArray(history) || history.length === 0) {
      return { rewrittenQuery: rawQuery, wasRewritten: false, entities: {} };
    }

    const entities = this.extractEntitiesFromHistory(history);
    const firstNameRef = this.firstNameReference(rawQuery, entities.engineer);
    const hasCoreference = firstNameRef || COREFERENCE_PATTERNS.some((pattern) => pattern.test(rawQuery));
    if (!hasCoreference || Object.keys(entities).length === 0) {
      return { rewrittenQuery: rawQuery, wasRewritten: false, entities: {} };
    }

    let rewritten = rawQuery;
    const replace = (pattern, value) => {
      if (!pattern.test(rewritten)) return;
      rewritten = rewritten.replace(new RegExp(pattern.source, 'gi'), value);
    };

    const prNumber = entities.pr ? entities.pr.replace('#', '') : null;

    // 1. PR / pull request
    if (prNumber) {
      replace(/\b(that|this|the)\s+(pr|pull request)\b/i, `PR #${prNumber}${entities.repository ? ` in ${entities.repository}` : ''}`);
    }

    // 2. Engineer
    if (entities.engineer) {
      const name = entities.engineer;
      replace(/\b(the author|that engineer|this engineer|the engineer)\b/i, `${name}${prNumber ? ` (author of PR #${prNumber})` : ''}`);
      replace(/\b(his|her|their)\s+(feedback|coaching|sbi|okrs?|growth|review|code review|current code review|pull requests|prs|blockers)\b/i, `${name}'s $2`);
      replace(/\bhim\b/i, name);
      if (firstNameRef) replace(new RegExp(`\\b${firstNameRef}\\b(?!\\s+${name.split(' ')[1]})`), name);
    }

    // 3. Team
    if (entities.team) replace(/\b(that|this|the same)\s+team\b/i, `team '${entities.team}'`);

    // 4. Sprint
    if (entities.sprint) replace(/\b(that|this|the current|the same)\s+sprint\b/i, entities.sprint);

    // 5. Repository / service
    if (entities.repository) replace(/\b(that|this|the)(\s+same)?\s+(repo|repository|service)\b/i, entities.repository);

    // 6. Metrics
    if (entities.metric) replace(/\b(these|those)\s+metrics\b/i, `$1 ${entities.metric} metrics`);

    return {
      rewrittenQuery: rewritten,
      wasRewritten: rewritten !== rawQuery,
      entities,
    };
  }

  /** A bare first name in the query ("for Sarah") that is the first name of the engineer in history. */
  firstNameReference(query, engineer) {
    if (!engineer || !engineer.includes(' ')) return null;
    const [first, last] = engineer.split(' ');
    const mentionsFirst = new RegExp(`\\b${first}\\b`).test(query);
    const mentionsFull = new RegExp(`\\b${first}\\s+${last}\\b`).test(query);
    return mentionsFirst && !mentionsFull ? first : null;
  }

  /**
   * Scans the latest 4 history messages (newest first) for the active entity anchors.
   */
  extractEntitiesFromHistory(history = []) {
    const texts = history.slice(-4).reverse().map(messageText).filter(Boolean);
    const entities = {};

    const pr = findFirst(texts, (t) => t.match(/(?:PR\s*#?|#)(\d{1,6})/i)?.[1]);
    if (pr) entities.pr = `#${pr}`;

    const engineer = findEngineer(texts);
    if (engineer) entities.engineer = engineer;

    const repository = findFirst(texts, (t) => {
      const m = t.match(/\b([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\b/);
      if (m && !t.includes(`http`) && !TIME_UNITS.test(m[2])) return `${m[1]}/${m[2]}`;
      return null;
    }) || findFirst(texts, (t) => t.match(SERVICE_PATTERN)?.[1]);
    if (repository) entities.repository = repository;

    const team = findFirst(texts, (t) => {
      const m = t.match(/(?:team|squad)\s*['"`]?([a-zA-Z0-9_\-\s]+?)['"`]?(?:\s+metrics|\s+DORA|\.|\n|$)/i);
      return m && m[1].trim().length < 40 ? m[1].trim() : null;
    });
    if (team) entities.team = team;

    const sprint = findFirst(texts, (t) => t.match(/(Sprint\s*\d{1,4})/i)?.[1]);
    if (sprint) entities.sprint = sprint;

    const metric = findFirst(texts, (t) => {
      if (/\bDORA\b|deployment frequency|change failure rate|lead time|\bMTTR\b|time to restore/i.test(t)) return 'DORA';
      if (/\bvelocity\b/i.test(t)) return 'velocity';
      return null;
    });
    if (metric) entities.metric = metric;

    return entities;
  }
}

const preRouterRewriter = new PreRouterRewriter();
export default preRouterRewriter;

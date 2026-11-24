/**
 * Keyword matching for deterministic routing.
 *
 * A plain substring check misroutes queries: "pr" matches "process" and "approach",
 * "kr" matches "work". Rules:
 *   - tokens of 3 characters or fewer must be a whole word (optionally plural): pr, prs, kr, adr
 *   - longer tokens must start a word, so "retro" still matches "retrospective"
 *   - a few short stems are allowed as prefixes (doc → docs, document)
 */
const PREFIX_STEMS = new Set(['doc']);
const cache = new Map();

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternFor(word) {
  const key = word.toLowerCase();
  if (!cache.has(key)) {
    const escaped = escapeRegex(key);
    const source = key.length <= 3 && !PREFIX_STEMS.has(key)
      ? `(^|[^a-z0-9])${escaped}s?([^a-z0-9]|$)`
      : `(^|[^a-z0-9])${escaped}`;
    cache.set(key, new RegExp(source, 'i'));
  }
  return cache.get(key);
}

/** True when `text` contains `word` as a keyword (see rules above). */
export function hasKeyword(text, word) {
  if (typeof text !== 'string' || !word) return false;
  return patternFor(word).test(text);
}

export default hasKeyword;

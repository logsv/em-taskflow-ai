/**
 * Verifier for free-text (LLM-written) answers: every figure in the answer must appear in the
 * evidence it was written from (retrieved chunks, tool outputs) or in the question itself.
 * Unsupported figures are reported, counted and shown to the reader; they are never silently kept.
 */
import { incCounter } from '../core/metrics.js';

const NUMBER_RE = /(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![\w.])-?\d+(?:\.\d+)?%?/g;
const LIST_MARKER_RE = /^\s*\d+[.)]\s/;

function normalize(token) {
  let t = String(token).replace(/,/g, '').replace(/%$/, '');
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t.replace(/^-0$/, '0');
}

/** Figures worth checking: skips ordered-list markers and bare single digits ("3 options"). */
export function extractFigures(text) {
  const figures = [];
  for (const line of String(text || '').split('\n')) {
    const body = line.replace(LIST_MARKER_RE, '');
    for (const m of body.matchAll(NUMBER_RE)) {
      const raw = m[0];
      const n = normalize(raw);
      if (/^-?\d$/.test(n) && !raw.endsWith('%')) continue;
      figures.push({ raw, n });
    }
  }
  return figures;
}

function numberSet(texts) {
  const set = new Set();
  for (const t of texts) for (const f of extractFigures(t)) set.add(f.n);
  // Single digits are skipped by extractFigures; keep them in the evidence set too.
  for (const t of texts) for (const m of String(t || '').matchAll(NUMBER_RE)) set.add(normalize(m[0]));
  return set;
}

/**
 * @param {string} answer
 * @param {string[]} evidenceTexts
 * @param {{ query?: string }} [opts]
 * @returns {{ checked: number, unsupported: string[], supported: boolean }}
 */
export function verifyFigures(answer, evidenceTexts = [], { query = '' } = {}) {
  const allowed = numberSet([...evidenceTexts, query]);
  const figures = extractFigures(answer);
  const unsupported = [...new Set(figures.filter((f) => !allowed.has(f.n)).map((f) => f.raw))];
  return { checked: figures.length, unsupported, supported: unsupported.length === 0 };
}

/**
 * Verify a free-text answer and make any problem visible. Returns the answer to show.
 * @param {'rag'|'integration'} kind
 */
export function applyFigureCheck(kind, answer, evidenceTexts, decision, { query } = {}) {
  const result = verifyFigures(answer, evidenceTexts, { query });
  decision.verification = { ...(decision.verification || {}), figures: result, evidenceCount: evidenceTexts.length };
  incCounter('verifier_answers_total', { kind, outcome: result.supported ? 'supported' : 'unsupported_figures' }, 1, 'Free-text answers checked by the verifier');
  if (result.supported) return answer;
  decision.reasons.push(`unsupported_figures:${result.unsupported.length}`);
  const note = evidenceTexts.length === 0
    ? `> ⚠️ **Unverified:** no source text was returned to check this answer against, so its figures (${result.unsupported.slice(0, 8).join(', ')}) are not verified.`
    : `> ⚠️ **Unverified figures:** ${result.unsupported.slice(0, 8).join(', ')} ${result.unsupported.length === 1 ? 'does' : 'do'} not appear in the sources this answer was written from. Treat ${result.unsupported.length === 1 ? 'it' : 'them'} as unconfirmed.`;
  return `${answer}\n\n${note}`;
}

export function evidenceTextsFromDocs(docs = []) {
  return (Array.isArray(docs) ? docs : []).map((d) => d?.pageContent ?? d?.content ?? (typeof d === 'string' ? d : '')).filter(Boolean);
}

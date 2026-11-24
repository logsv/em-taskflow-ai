/**
 * Query → tool `target` / `mode` hints shared by every capability (moved from agentService).
 * Pure keyword rules; the planner LLM chooses capabilities, these only pick a view within one.
 */
import { hasKeyword } from '../utils/keywords.js';

const RULES = [
  ['PRS', (q) => hasKeyword(q, 'pr') || q.includes('pull request')],
  ['WIP_ITEMS', (q) => hasKeyword(q, 'wip')],
  ['BLOCKERS', (q) => hasKeyword(q, 'block') || hasKeyword(q, 'dependency') || hasKeyword(q, 'dependencies')],
  ['RELEASES', (q) => hasKeyword(q, 'release') || hasKeyword(q, 'deploy')],
  ['ONE_ON_ONES', (q) => hasKeyword(q, '1-on-1') || q.includes('one on one') || hasKeyword(q, 'meeting')],
  ['SKILL_GAPS', (q) => hasKeyword(q, 'skill') || hasKeyword(q, 'gap') || hasKeyword(q, 'competenc')],
  ['ACTION_ITEMS', (q) => q.includes('action item') || q.includes('retro item')],
  ['PATTERNS', (q) => hasKeyword(q, 'pattern') || hasKeyword(q, 'recurring') || hasKeyword(q, 'friction')],
  ['EPICS', (q) => hasKeyword(q, 'epic') || q.includes('roadmap item')],
  ['DRIFT', (q) => hasKeyword(q, 'drift') || q.includes('scope creep') || hasKeyword(q, 'milestone')],
  ['AT_RISK', (q) => q.includes('at risk') || q.includes('off track') || hasKeyword(q, 'lagging')],
  ['GAP_REMEDIATION', (q) => hasKeyword(q, 'remediation')],
  ['KRS', (q) => hasKeyword(q, 'okr') || q.includes('key result') || hasKeyword(q, 'kr')],
  ['ADRS', (q) => hasKeyword(q, 'adr') || q.includes('architecture decision')],
  ['SOPS', (q) => hasKeyword(q, 'sop') || hasKeyword(q, 'policy') || hasKeyword(q, 'governance') || hasKeyword(q, 'standard')],
  ['VIOLATIONS', (q) => hasKeyword(q, 'violation') || hasKeyword(q, 'non-compliant') || q.includes('non compliant')],
  ['TALKING_SCRIPT', (q) => hasKeyword(q, 'script') || hasKeyword(q, 'talking')],
  ['BIAS_AUDIT', (q) => hasKeyword(q, 'bias') || hasKeyword(q, 'objectivity')],
  ['CHECKS', (q) => hasKeyword(q, 'check') || hasKeyword(q, 'audit')],
];

export function detectTarget(query) {
  const q = String(query || '').toLowerCase();
  return RULES.find(([, test]) => test(q))?.[0] || 'ALL';
}

export function isListQuery(query) {
  const q = String(query || '').toLowerCase();
  return q.startsWith('list ') || q.startsWith('show all ') || q.includes('list all') || q.includes('list raw');
}

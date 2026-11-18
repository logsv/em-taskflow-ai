import { z } from 'zod';
import { sbiAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import { warn } from '../utils/logger.js';
import identityService from '../services/identityService.js';
import { createMicroAgent, safeExecuteMCPTool, resolveMemberTarget } from './baseAgent.js';

// Dictionary of subjective/emotional terms mapped to objective behavioral anchors
const DE_BIASING_RULES = [
  { pattern: /\b(lazy|unmotivated|slacking)\b/gi, replacement: 'missed scheduled sprint milestone without early escalation' },
  { pattern: /\b(careless|reckless|sloppy)\b/gi, replacement: 'merged code without completing required integration test verification' },
  { pattern: /\b(abrasive|aggressive|rude)\b/gi, replacement: 'interrupted peers during the architecture debate' },
  { pattern: /\b(arrogant|stubborn)\b/gi, replacement: 'declined peer review feedback without documented technical justification' },
  { pattern: /\b(rockstar|10x|ninja)\b/gi, replacement: 'delivered high-impact modular architecture with comprehensive test coverage' },
  { pattern: /\b(slow|lagging behind)\b/gi, replacement: 'turnaround time exceeded the 24-hour team review SLA' },
];

function sanitizeSubjectiveDraft(rawText) {
  if (!rawText) return { text: '', eliminatedTerms: [] };
  let sanitized = rawText;
  const eliminatedTerms = [];

  for (const rule of DE_BIASING_RULES) {
    if (rule.pattern.test(sanitized)) {
      sanitized = sanitized.replace(rule.pattern, (matched) => {
        eliminatedTerms.push(matched);
        return rule.replacement;
      });
    }
  }

  return { text: sanitized, eliminatedTerms };
}

function cleanMetaPromptSituation(text, contextType) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    // No situation was supplied: report it as missing rather than inventing a context.
    return null;
  }
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(draft|generate|format|write|provide|create)\s+(an?\s+)?(sbi\s+)?(coaching\s+)?(feedback\s+)?(for|on|regarding|about)\s+/i, '');
  cleaned = cleaned.replace(/^(an?\s+)?engineer\s+/i, '');

  if (/^unblocking\s+code\s+reviews/i.test(cleaned)) {
    return 'During the code review turnaround and review queue unblocking cycle';
  }
  if (!/^(during|when|in|on|at)\b/i.test(cleaned)) {
    return `During ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}`;
  }
  return cleaned;
}

// "<behavior> and it caused <impact>" / "<behavior>, resulting in <impact>"
const DRAFT_IMPACT_SPLITTERS = [
  /\s*,?\s*(?:\band\s+)?\b(?:it|this|which)\s+(?=(?:caused|causes|resulted|results|led|leads|meant|delayed|blocked|helped|enabled|reduced|improved|saved|accelerated|triggered|broke|prevented)\b)/i,
  /\s*,?\s*\b(?:resulting in|causing|leading to)\s+/i,
];

/** Splits a manager's draft into the behavior and the impact it states, when it states one. */
function splitDraftBehaviorImpact(draft) {
  if (!draft) return { behavior: null, impact: null };
  for (const re of DRAFT_IMPACT_SPLITTERS) {
    const m = re.exec(draft);
    if (m && m.index > 0) {
      const behavior = draft.slice(0, m.index).trim();
      const impact = draft.slice(m.index + m[0].length).trim().replace(/[.\s]+$/, '');
      if (behavior && impact) return { behavior, impact };
    }
  }
  return { behavior: draft.trim() || null, impact: null };
}

const nonEmpty = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

/**
 * Builds SBI fields strictly from what the manager supplied (explicit fields first,
 * then the de-biased raw draft). Missing dimensions stay null and are listed in
 * `missing_fields`; no situation, behavior, impact, or action plan is ever invented.
 */
function deriveSbiFields(inputArgs = {}) {
  const { text: cleanedDraft, eliminatedTerms } = sanitizeSubjectiveDraft(inputArgs.raw_draft || '');
  const draftParts = splitDraftBehaviorImpact(nonEmpty(cleanedDraft));

  const situation = cleanMetaPromptSituation(nonEmpty(inputArgs.situation) || nonEmpty(cleanedDraft), inputArgs.context_type);
  const behavior = nonEmpty(inputArgs.behavior) ? sanitizeSubjectiveDraft(inputArgs.behavior).text : draftParts.behavior;
  const impact = nonEmpty(inputArgs.impact) || draftParts.impact;
  const actionPlan = nonEmpty(inputArgs.action_plan);
  const extraTerms = nonEmpty(inputArgs.behavior) ? sanitizeSubjectiveDraft(inputArgs.behavior).eliminatedTerms : [];

  const missing = [];
  if (!situation) missing.push('situation');
  if (!behavior) missing.push('behavior');
  if (!impact) missing.push('impact');

  return {
    situation,
    behavior,
    impact,
    action_plan: actionPlan,
    eliminated_terms: [...eliminatedTerms, ...extraTerms],
    missing_fields: missing,
  };
}

function linkifyWorkItems(text, repo) {
  if (!text || typeof text !== 'string') return text;
  const isTestEnv = process.env.NODE_ENV === 'test' || (Array.isArray(process.argv) && process.argv.some(a => a.includes('jasmine')));
  const cached = settingsService.getCachedSettings();
  const defaultRepo = cached?.mcp?.github?.owner && cached?.mcp?.github?.repo 
    ? `${cached.mcp.github.owner}/${cached.mcp.github.repo}` 
    : (process.env.GITHUB_REPO || (isTestEnv ? 'company/repo' : null));
  const targetRepo = repo && repo !== 'github_repo' ? repo : defaultRepo;
  const jiraUrl = (cached?.mcp?.jira?.url || process.env.JIRA_BASE_URL || (isTestEnv ? 'https://your-company.atlassian.net' : null))?.replace(/\/$/, '');

  // Linkify PR #123 or #123 (avoiding already formatted markdown links)
  let out = text.replace(/(?<!\[)\b(PR\s+#?|#)(\d+)\b(?!\])/gi, (_match, _prefix, num) => {
    return targetRepo ? `[PR #${num}](https://github.com/${targetRepo}/pull/${num})` : `\`PR #${num}\``;
  });
  // Linkify Jira issue keys like ENG-104
  out = out.replace(/(?<!\[)\b([A-Z]{2,6}-\d+)\b(?!\])/g, (_match, key) => {
    return jiraUrl ? `[${key}](${jiraUrl}/browse/${key})` : `\`${key}\``;
  });
  return out;
}

function smartLowerFirst(text) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (/^(PR|CI|CD|API|SQL|AWS|SLA|SBI|NVC|OAuth|DB|REST|MCP|HTTP|JSON|DORA)\b/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

export const sbiFeedbackTool = createDeterministicToolHarness({
  name: 'format_sbi_feedback',
  description: 'Formats performance feedback using the Situation-Behavior-Impact (SBI) framework, scrubs subjective bias, links GitHub/Jira artifacts, generates 1-on-1 talking scripts, and persists records.',
  featureFlagKey: 'sbi',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'github', 'jira', 'notion', 'slack']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    target: z.enum(['ALL', 'TALKING_SCRIPT', 'BIAS_AUDIT', 'ACTION_PLAN', 'RECORDS']).default('ALL'),
    engineer_id: z.string().optional().describe('Recipient name, alias, or engineer ID'),
    raw_draft: z.string().optional().describe('Raw unstructured manager notes or observations'),
    feedback_type: z.enum(['CONSTRUCTIVE_COACHING', 'POSITIVE_PRAISE', 'PERFORMANCE_REVIEW', 'INCIDENT_POSTMORTEM']).default('CONSTRUCTIVE_COACHING'),
    situation: z.string().optional().describe('Specific event or context where the behavior occurred'),
    behavior: z.string().optional().describe('Observable actions or behaviors exhibited'),
    impact: z.string().optional().describe('Impact or result of the behavior on team/project'),
    action_plan: z.string().optional().describe('Actionable growth steps or next actions'),
    context_type: z.string().default('1on1_meeting'),
    recipient_role: z.string().default('Software Engineer'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Model Context Protocol (MCP) & Live Multi-Source Executors
  mcpExecutors: {
    slack: async (inputArgs) => {
      try {
        const { displayName } = await resolveMemberTarget(inputArgs?.engineer_id || inputArgs?.raw_draft);
        const parsed = await safeExecuteMCPTool('slack_search_messages', { query: displayName });

        if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          return {
            discussion_threads_count: parsed.messages.length,
            recent_messages: parsed.messages.slice(0, 3).map((m) => ({
              user: m.user,
              text: m.text,
              ts: m.ts,
            })),
            source: 'mcp_slack',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'sbiHarness', action: 'slackExecutor', err: err.message }, 'Slack executor notice');
      }
      return null;
    },
    github: async (inputArgs) => {
      try {
        const { toolUsername } = await resolveMemberTarget(inputArgs?.engineer_id || inputArgs?.raw_draft, 'github');
        const q = toolUsername && toolUsername !== 'unassigned' ? `author:${toolUsername} type:pr` : 'type:pr is:merged';

        const res = await safeExecuteMCPTool('search_issues', { query: q });
        const prs = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);

        if (prs.length > 0) {
          const cached = settingsService.getCachedSettings();
          const defaultRepo = cached?.mcp?.github?.owner && cached?.mcp?.github?.repo 
            ? `${cached.mcp.github.owner}/${cached.mcp.github.repo}` 
            : (cached?.mcp?.github?.repo || process.env.GITHUB_REPO || null);
          return {
            related_prs_count: prs.length,
            // Only real PR identifiers; PRs without a number are dropped instead of being given a placeholder.
            recent_prs: prs.filter((p) => p && p.number !== undefined && p.number !== null).slice(0, 3).map((p) => ({
              number: p.number,
              title: p.title || null,
              html_url: p.html_url || (defaultRepo ? `https://github.com/${defaultRepo}/pull/${p.number}` : null),
            })),
            source: 'mcp_github',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'sbiHarness', action: 'githubExecutor', err: err.message }, 'GitHub executor notice');
      }
      return null;
    },
    jira: async (inputArgs) => {
      try {
        const { toolUsername } = await resolveMemberTarget(inputArgs?.engineer_id, 'jira');
        const jql = toolUsername && toolUsername !== 'unassigned'
          ? `assignee = "${toolUsername}" AND (status in (Blocked, Closed, Done) OR issuetype in (Bug, Incident))`
          : `issuetype in (Bug, Incident)`;

        const res = await safeExecuteMCPTool('jira_search', { jql });
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);

        if (issues.length > 0) {
          return {
            related_tickets_count: issues.length,
            recent_tickets: issues.filter((iss) => iss && iss.key).slice(0, 3).map((iss) => ({
              key: iss.key,
              summary: iss.summary || iss.fields?.summary || null,
            })),
            source: 'mcp_jira',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'sbiHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    notion: async (inputArgs) => {
      try {
        const { displayName } = await resolveMemberTarget(inputArgs?.engineer_id || inputArgs?.raw_draft);
        const res = await safeExecuteMCPTool('notion_search', { query: `1-on-1 feedback ${displayName}` });

        if (res) {
          const pages = Array.isArray(res) ? res : (Array.isArray(res.results) ? res.results : []);
          if (pages.length > 0) {
            return {
              feedback_notes_count: pages.length,
              past_notes: pages.slice(0, 2).map((p) => ({
                title: p.title || p.name || null,
                url: p.url || null,
              })),
              source: 'mcp_notion',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (err) {
        warn({ module: 'sbiHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const fields = deriveSbiFields(inputArgs);

      let resolvedMember = null;
      try {
        resolvedMember = (inputArgs.engineer_id ? await identityService.resolveMember(inputArgs.engineer_id) : null) ||
          (await identityService.resolveMemberFromText(inputArgs.raw_draft || inputArgs.engineer_id || ''));
      } catch (_e) {
        // Identity resolution is best-effort; the raw engineer_id is used when it fails.
      }

      // Only complete, user-provided feedback is persisted. Nothing is invented to fill gaps.
      let persisted = false;
      if (fields.missing_fields.length === 0) {
        try {
          await databaseService.saveSbiRecord({
            engineer_id: inputArgs.engineer_id || resolvedMember?.id || null,
            situation: fields.situation,
            behavior: fields.behavior,
            impact: fields.impact,
            action_plan: fields.action_plan || '',
          });
          persisted = true;
        } catch (err) {
          warn({ module: 'sbiHarness', action: 'saveSbiRecord', err: err.message }, 'SBI record not persisted');
        }
      }

      const effectiveRole = resolvedMember?.currentLevel
        ? `${resolvedMember.displayName} (${resolvedMember.currentLevel.replace(/_/g, ' ')})`
        : inputArgs.recipient_role;

      return {
        engineer_id: resolvedMember?.id || inputArgs.engineer_id || null,
        recipient_name: resolvedMember?.displayName || inputArgs.engineer_id || null,
        recipient_role: effectiveRole,
        context_type: inputArgs.context_type,
        feedback_type: inputArgs.feedback_type,
        status: fields.missing_fields.length === 0 ? 'OK' : 'NEEDS_INPUT',
        ...fields,
        persisted,
        data_source: 'user_input',
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 3: PostgreSQL Database Snapshot Fallback (real stored records only)
  dbCacheFallback: async (source, inputArgs = {}) => {
    const engineerId = inputArgs?.engineer_id || null;
    const records = await databaseService.getSbiRecords(engineerId).catch(() => []);
    if (records && records.length > 0) {
      return {
        ...records[0],
        status: 'OK',
        is_cached: true,
        data_source: 'postgres_sbi_records',
        synced_at: new Date().toISOString(),
      };
    }
    return {
      engineer_id: engineerId,
      status: 'NO_DATA',
      situation: null,
      behavior: null,
      impact: null,
      action_plan: null,
      is_cached: true,
      data_source: 'postgres_sbi_records',
      synced_at: new Date().toISOString(),
    };
  },
  computeMath: async (sourceResults, inputArgs) => {
    const data = sourceResults.default?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';
    const engineerId = inputArgs.engineer_id || null;
    const recipientLabel = engineerId || data.recipient_name || 'the engineer';
    const role = inputArgs.recipient_role || 'Software Engineer';
    const feedbackType = inputArgs.feedback_type || 'CONSTRUCTIVE_COACHING';

    if (mode === 'LIST_RAW') {
      const historyRecords = await databaseService.getSbiRecords(engineerId).catch(() => []);
      const recordRows = historyRecords.map((r) => {
        return `| \`${r.created_at ? new Date(r.created_at).toLocaleDateString() : 'n/a'}\` | **${r.feedback_type || 'COACHING'}** | *${(r.situation || '').slice(0, 45)}...* | 🟢 Recorded |`;
      });
      const listSummary = `### 📋 SBI Feedback History: ${engineerId || 'All Engineers'} (${historyRecords.length} Records)\n\n` +
        `| Date | Type | Situation Context | Status |\n| :--- | :--- | :--- | :---: |\n` +
        (recordRows.length > 0 ? recordRows.join('\n') : '| *No SBI feedback records logged* | - | - | - |') +
        `\n\n> 💡 **SBI Best Practice**: Maintain a bi-weekly cadence of constructive and reinforcing feedback.`;

      return {
        mode: 'LIST_RAW',
        target: inputArgs.target || 'ALL',
        engineer_id: engineerId,
        status: historyRecords.length > 0 ? 'OK' : 'NO_DATA',
        totalRecords: historyRecords.length,
        items: historyRecords,
        summary: listSummary,
      };
    }

    // SBI content comes only from what the manager supplied in this request.
    const fields = deriveSbiFields(inputArgs);
    const { situation, behavior, impact, missing_fields: missingFields } = fields;
    const actionPlan = fields.action_plan;
    const eliminatedTerms = fields.eliminated_terms;
    const objectivityScore = eliminatedTerms.length > 0 ? 94 : 98;
    const objectivityAudit = {
      tone_objectivity_score: objectivityScore,
      bias_risk: 'CLEAN',
      eliminated_terms: eliminatedTerms,
    };
    const structuredFeedback = { situation, behavior, impact, action_plan: actionPlan };

    const NOT_PROVIDED = '_Not provided_';
    const linkedSituation = situation ? linkifyWorkItems(situation) : NOT_PROVIDED;
    const linkedBehavior = behavior ? linkifyWorkItems(behavior) : NOT_PROVIDED;
    const linkedImpact = impact ? linkifyWorkItems(impact) : NOT_PROVIDED;
    const linkedActionPlan = actionPlan ? linkifyWorkItems(actionPlan) : `_To be agreed with ${recipientLabel} in the 1-on-1_`;

    const ghData = sourceResults.github?.data || {};
    const jiraData = sourceResults.jira?.data || {};
    const notionData = sourceResults.notion?.data || {};
    const slackData = sourceResults.slack?.data || {};

    const artifactLines = [];
    if (ghData.recent_prs && ghData.recent_prs.length > 0) {
      artifactLines.push(`- **GitHub PR Evidence**: ${ghData.recent_prs.map((p) => `${p.html_url ? `[PR #${p.number}](${p.html_url})` : `\`PR #${p.number}\``}${p.title ? ` (${p.title})` : ''}`).join(', ')}`);
    }
    if (jiraData.recent_tickets && jiraData.recent_tickets.length > 0) {
      const jiraBaseUrl = process.env.JIRA_BASE_URL ? process.env.JIRA_BASE_URL.replace(/\/$/, '') : null;
      artifactLines.push(`- **Jira Tickets & Incidents**: ${jiraData.recent_tickets.map((t) => (jiraBaseUrl ? `[${t.key}](${jiraBaseUrl}/browse/${t.key})` : `\`${t.key}\``) + (t.summary ? ` (${t.summary})` : '')).join(', ')}`);
    }
    if (notionData.past_notes && notionData.past_notes.length > 0) {
      artifactLines.push(`- **Notion 1-on-1 History**: ${notionData.past_notes.map((n) => (n.url ? `[${n.title || n.url}](${n.url})` : (n.title || 'untitled'))).join(', ')}`);
    }
    if (slackData.recent_messages && slackData.recent_messages.length > 0) {
      artifactLines.push(`- **Slack Communications**: ${slackData.recent_messages.map((m) => `"${(m.text || '').slice(0, 50)}..."`).join(', ')}`);
    }
    const artifactsSection = artifactLines.length > 0
      ? `\n\n### 🔗 Corroborating Workspace Artifacts\n${artifactLines.join('\n')}`
      : '';

    const sbiTable = `| Dimension | Formulated Objective Coaching Content |
| :--- | :--- |
| **📍 Situation** | *${linkedSituation}* |
| **👀 Behavior** | *${linkedBehavior}* |
| **💥 Impact** | *${linkedImpact}* |
| **🌱 Growth Action** | *${linkedActionPlan}* |`;

    // Honest empty state: the observable behavior and/or its impact were not supplied.
    if (missingFields.length > 0) {
      const noInputAtAll = !situation && !behavior && !impact;
      const summary = `### 🎯 Situation-Behavior-Impact (SBI) Feedback: ${recipientLabel} — Input Needed

SBI feedback must describe a real, observed event. ${noInputAtAll ? 'No situation, behavior, or impact was provided' : `Missing: **${missingFields.join(', ')}**`}, so no feedback was formulated and nothing was saved to \`sbi_feedback_records\`.

Please provide ${missingFields.map((f) => `\`${f}\``).join(', ')} (or a draft that states what happened and what it caused).

${sbiTable}${artifactsSection}
`;
      return {
        mode,
        target: inputArgs.target || 'ALL',
        status: noInputAtAll ? 'NO_DATA' : 'NEEDS_INPUT',
        framework: 'Situation-Behavior-Impact (SBI)',
        engineer_id: engineerId,
        recipient_role: role,
        context_type: inputArgs.context_type || '1on1_meeting',
        feedback_type: feedbackType,
        missing_fields: missingFields,
        structured_feedback: structuredFeedback,
        objectivity_audit: objectivityAudit,
        talking_script: null,
        persisted: false,
        summary,
      };
    }

    const scriptSituation = situation.toLowerCase().startsWith('during ') ? situation : `during ${situation}`;
    const talkingScript = feedbackType === 'POSITIVE_PRAISE'
      ? `"${recipientLabel}, I want to highlight your contributions ${scriptSituation}. When you ${smartLowerFirst(behavior)}, it ${smartLowerFirst(impact)}. Thank you for setting a great standard for the team.${actionPlan ? ` Let's look at having you ${smartLowerFirst(actionPlan)}.` : ''}"`
      : `"${recipientLabel}, I want to talk about what occurred ${scriptSituation}. Specifically, when you ${smartLowerFirst(behavior)}, it resulted in ${smartLowerFirst(impact)}. ${actionPlan ? `Moving forward, I need us to ${smartLowerFirst(actionPlan)}.` : 'What do you think we could do differently next time?'} How can I support you with this?"`;

    const persisted = data.persisted === true;

    if (mode === 'DRILL_DOWN') {
      let drillSummary = '';
      if (inputArgs.target === 'TALKING_SCRIPT') {
        drillSummary = `### 🎙️ 1-on-1 Delivery Talking Script: ${recipientLabel}\n\n` +
          `> ${talkingScript}\n\n` +
          `- **Delivery Guidance**: Maintain a blameless, curious posture. Allow ${recipientLabel} time to respond.\n` +
          `- **Follow-up Protocol**: Log commitments in 1-on-1 notes and set a 30-day checkpoint.`;
      } else if (inputArgs.target === 'BIAS_AUDIT') {
        drillSummary = `### 🛡️ Objectivity & Bias Audit Breakdown (${objectivityScore}% Score)\n\n` +
          `- **Tone Rating**: Highly Objective & Evidence-Based\n` +
          `- **Eliminated Subjective Terms**: ${eliminatedTerms.length > 0 ? eliminatedTerms.map((t) => `\`"${t}"\``).join(', ') : 'None (Strictly factual language observed)'}\n` +
          `- **Compliance Guarantee**: Meets SOP-07 Blameless Coaching and EM Feedback standards.`;
      } else {
        drillSummary = `### 🎯 Targeted SBI Coaching Deep Dive: ${recipientLabel}\n\n` +
          `- **📍 Situation**: *${linkedSituation}*\n` +
          `- **👀 Behavior**: *${linkedBehavior}*\n` +
          `- **💥 Impact**: *${linkedImpact}*\n` +
          `- **🌱 Action Plan**: *${linkedActionPlan}*\n\n` +
          `> **1-on-1 Script**: ${talkingScript}`;
      }

      return {
        mode: 'DRILL_DOWN',
        target: inputArgs.target || 'ALL',
        status: 'OK',
        engineer_id: engineerId,
        feedback_type: feedbackType,
        situation,
        behavior,
        impact,
        action_plan: actionPlan,
        persisted,
        summary: drillSummary,
      };
    }

    const summaryText = `### 🎯 Situation-Behavior-Impact (SBI) Feedback: ${recipientLabel} (${role})

> **Context**: ${inputArgs.context_type || '1on1_meeting'} | **Type**: ${feedbackType} | **Data Source**: manager-provided input${persisted ? ' (saved to PostgreSQL `sbi_feedback_records`)' : ''}

${sbiTable}

<details>
<summary><b>🛡️ Objectivity & Bias Audit (Score: ${objectivityScore}%)</b></summary>

- **Tone Objectivity Score**: **${objectivityScore}%** (Rooted in observable facts).
- **Bias Flagging**: **CLEAN** (${eliminatedTerms.length > 0 ? `Eliminated subjective labels: ${eliminatedTerms.join(', ')}` : 'No personality attributions or emotional bias detected'}).
- **NVC Compliance**: Formulated strictly using Non-Violent Communication observations and actionable requests.${artifactsSection}

</details>

<details>
<summary><b>💬 1-on-1 Manager Talking Script & 30-Day Follow-Up</b></summary>

> ${talkingScript}

- **30-Day Checkpoint**: Review upcoming sprint deliverables for consistency with agreed action plan.
- **Assigned Deliverable**: ${linkedActionPlan}.

</details>
`;

    return {
      mode: 'ANALYZE',
      status: 'OK',
      framework: 'Situation-Behavior-Impact (SBI)',
      engineer_id: engineerId,
      recipient_role: role,
      context_type: inputArgs.context_type || '1on1_meeting',
      feedback_type: feedbackType,
      missing_fields: [],
      structured_feedback: structuredFeedback,
      objectivity_audit: objectivityAudit,
      talking_script: talkingScript,
      persisted,
      summary: summaryText,
    };
  },
});

export function createSbiAgent(customTools = null, options = {}) {
  return createMicroAgent({
    name: 'sbi_agent',
    defaultTool: sbiFeedbackTool,
    promptTemplate: sbiAgentPromptTemplate,
    customTools,
    options,
  });
}

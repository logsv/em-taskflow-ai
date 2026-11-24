import { z } from 'zod';
import { retroAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import identityService from '../services/identityService.js';
import settingsService from '../services/settingsService.js';
import { info, warn, error } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool } from './baseAgent.js';
import { swallow, recordHandledError } from '../core/safe.js';

export const sprintRetroTool = createDeterministicToolHarness({
  name: 'generate_sprint_retro',
  description: 'Synthesizes sprint delivery performance into structured retrospective notes, thematic friction clusters, multi-sprint recurring pattern detection, and SMART action items.',
  featureFlagKey: 'retro',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'notion', 'jira', 'github', 'slack']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    target: z.enum(['ALL', 'ACTION_ITEMS', 'PATTERNS', 'FRICTION_POINTS', 'WINS']).default('ALL'),
    sprint_id: z.string().optional(),
    sprint_name: z.string().optional(),
    retro_notes: z.string().optional().describe('Raw retro feedback notes, cards, or team chat transcript'),
    post_to_slack: z.boolean().default(false).describe('Whether to post the generated action plan directly to Slack channel'),
    slack_channel: z.string().optional().describe('Target Slack channel name or ID (default: #engineering-retro)'),
    include_past_sprints_count: z.number().default(3),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Live MCP & Multi-Source Executors
  mcpExecutors: {
    slack: async (inputArgs) => {
      try {
        const targetChannel = inputArgs?.slack_channel || settingsService.getCachedSettings()?.mcp?.slack?.defaultChannel || '#engineering-retro';
        const query = inputArgs?.sprint_name ? `${inputArgs.sprint_name}` : 'retro';

        const parsed = await safeExecuteMCPTool('slack_search_messages', { query, channel: targetChannel, limit: 10 });

        if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          return {
            channel: targetChannel,
            messages_count: parsed.messages.length,
            messages: parsed.messages,
            source: 'mcp_slack',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'retroHarness', action: 'slackExecutor', err: err.message }, 'Slack executor notice');
      }
      return null;
    },
    notion: async (_inputArgs) => {
      try {
        const configuredPageId = settingsService.getCachedSettings()?.mcp?.notion?.retroPageId || process.env.NOTION_RETRO_PAGE_ID;
        const res = await safeExecuteMCPTool('notion_search', { query: configuredPageId || 'Sprint Retrospective Retro Board' });

        if (res) {
          const pages = Array.isArray(res) ? res : (Array.isArray(res.results) ? res.results : []);
          if (pages.length > 0) {
            return {
              retro_board_found: true,
              board_title: pages[0].title || 'Sprint Retrospective Board',
              board_url: pages[0].url || null,
              source: 'mcp_notion',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (err) {
        warn({ module: 'retroHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    jira: async (_inputArgs) => {
      try {
        const jql = 'issuetype in (Bug, Incident) AND status in (Closed, Resolved, "In Progress") ORDER BY created DESC';
        const res = await safeExecuteMCPTool('jira_search', { jql });
        if (!res) return null;
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);

        return {
          total_incidents_reported: issues.length,
          recent_incidents: issues.slice(0, 3).map((iss) => ({
            key: iss.key,
            summary: iss.summary || iss.fields?.summary || '(no summary)',
            status: iss.status || iss.fields?.status?.name || 'unknown',
          })),
          source: 'mcp_jira',
          synced_at: new Date().toISOString(),
        };
      } catch (err) {
        warn({ module: 'retroHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    github: async (_inputArgs) => {
      try {
        const res = await safeExecuteMCPTool('get_dora_events', { window_days: 14 });

        const turnaround = Number(res?.pr_turnaround_hours ?? res?.review_wait_time_hours);
        const merged = Number(res?.total_prs_merged ?? res?.pull_requests_analyzed);
        if (!Number.isFinite(turnaround) && !Number.isFinite(merged)) return null;
        return {
          pr_turnaround_hours: Number.isFinite(turnaround) && turnaround > 0 ? turnaround : null,
          total_prs_merged: Number.isFinite(merged) ? merged : null,
          source: 'mcp_github',
          synced_at: new Date().toISOString(),
        };
      } catch (err) {
        warn({ module: 'retroHarness', action: 'githubExecutor', err: err.message }, 'GitHub executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const members = await databaseService.getTeamMembers().catch(swallow('agent.retroAgent.default', []));
      const analytics = await databaseService.getSprintAnalytics().catch(swallow('agent.retroAgent.default', []));
      const pastRetros = analytics.slice(0, inputArgs.include_past_sprints_count || 3);

      return {
        sprint_id: inputArgs.sprint_id || null,
        sprint_name: inputArgs.sprint_name || null,
        team_members: members.map((m) => m.displayName),
        historical_retros_count: pastRetros.length,
        past_retro_items: pastRetros.flatMap((r) => r.retro_action_items || []),
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 2: PostgreSQL Database Snapshot Fallback
  dbCacheFallback: async (source, inputArgs = {}) => {
    try {
      const members = await databaseService.getTeamMembers().catch(swallow('agent.retroAgent.dbCacheFallback', []));
      const analytics = await databaseService.getSprintAnalytics().catch(swallow('agent.retroAgent.dbCacheFallback', []));
      const pastRetros = analytics.slice(0, inputArgs?.include_past_sprints_count || 3);

      return {
        sprint_id: inputArgs?.sprint_id || null,
        sprint_name: inputArgs?.sprint_name || null,
        team_members: members.map((m) => m.displayName),
        past_retro_items: pastRetros.flatMap((r) => r.retro_action_items || []),
        is_cached: true,
        data_source: 'postgres_sprint_analytics',
        synced_at: new Date().toISOString(),
      };
    } catch (_e) {
      return {
        sprint_id: inputArgs?.sprint_id || null,
        sprint_name: inputArgs?.sprint_name || null,
        team_members: [],
        past_retro_items: [],
        is_cached: true,
        data_source: 'empty',
        data_availability: 'no_data',
      };
    }
  },
  // Tier 3: Thematic clustering over real inputs only (notes, Slack, Jira incidents, GitHub PR stats).
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data || {};
    const slackData = sourceResults.slack?.data || {};
    const jiraData = sourceResults.jira?.data || {};
    const githubData = sourceResults.github?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';
    const sprintId = inputArgs.sprint_id || null;
    const sprintName = inputArgs.sprint_name || inputArgs.sprint_id || 'the sprint';
    const rawNotes = String(inputArgs.retro_notes || '');

    const POSITIVE = /\b(good|win|wins|well|proud|great|kudos|celebrate|thank|thanks|shoutout|smooth)\b/i;
    const NEGATIVE = /\b(slow|stuck|friction|bad|improve|flaky|hard|block|blocked|blocker|bug|issue|delay|delayed|outage|incident)\b/i;
    const THEMES = [
      { key: 'CI_RELIABILITY', label: 'CI / test reliability', re: /\b(ci|flaky|pipeline|build|test)\b/i },
      { key: 'CODE_REVIEW', label: 'Code review flow', re: /\b(review|pr|prs|turnaround|merge)\b/i },
      { key: 'SCOPE_CHURN', label: 'Scope churn / interruptions', re: /\b(scope|churn|interrupt|escalation|context switch|unplanned)\b/i },
      { key: 'INCIDENTS', label: 'Production incidents', re: /\b(incident|outage|sev|hotfix|rollback)\b/i },
      { key: 'COMMUNICATION', label: 'Communication & alignment', re: /\b(communication|alignment|unclear|requirements|handoff)\b/i },
    ];

    const whatWentWell = [];
    const whatNeedsImprovement = [];
    const addItem = (text, origin) => {
      const clean = text.replace(/^[-*•]\s*/, '').trim();
      if (!clean) return;
      if (POSITIVE.test(clean) && !NEGATIVE.test(clean)) whatWentWell.push({ text: clean, origin });
      else if (NEGATIVE.test(clean)) whatNeedsImprovement.push({ text: clean, origin });
    };

    rawNotes.split('\n').forEach((l) => addItem(l, 'retro notes'));
    const slackMessages = Array.isArray(slackData.messages) ? slackData.messages : [];
    slackMessages.forEach((m) => addItem(String(m.text || ''), `Slack${m.user ? ` (${m.user})` : ''}`));

    // Measured signals.
    const incidents = Array.isArray(jiraData.recent_incidents) ? jiraData.recent_incidents : [];
    if (Number.isFinite(jiraData.total_incidents_reported) && jiraData.total_incidents_reported > 0) {
      whatNeedsImprovement.push({ text: `${jiraData.total_incidents_reported} bug/incident ticket(s) in Jira this period${incidents.length ? ` (e.g. ${incidents.map((i) => i.key).filter(Boolean).join(', ')})` : ''}`, origin: 'Jira' });
    }
    if (githubData.pr_turnaround_hours !== null && githubData.pr_turnaround_hours !== undefined) {
      const line = `Average PR turnaround ${githubData.pr_turnaround_hours}h${githubData.total_prs_merged !== null && githubData.total_prs_merged !== undefined ? ` across ${githubData.total_prs_merged} PRs` : ''}`;
      (githubData.pr_turnaround_hours > 24 ? whatNeedsImprovement : whatWentWell).push({ text: line, origin: 'GitHub' });
    }

    const hasInput = whatWentWell.length + whatNeedsImprovement.length > 0;
    if (!hasInput && mode !== 'LIST_RAW') {
      return {
        mode,
        target: inputArgs.target || 'ALL',
        sprint_id: sprintId,
        status: 'NEEDS_INPUT',
        data_availability: 'no_retro_input',
        what_went_well: [],
        what_needs_improvement: [],
        recurring_patterns: [],
        extracted_action_items: [],
        summary: `### 🔁 Sprint Retrospective: ${sprintName}\n\n> There is no retrospective input yet. Paste the team's retro notes, or connect Slack (retro channel), Jira or GitHub in **Admin → Settings**, and I will cluster the themes and draft action items.`,
      };
    }

    // Themes and recurring patterns (a theme is "recurring" only if a past action item matches it).
    const pastItems = (defaultData.past_retro_items || []).map((it) => (typeof it === 'string' ? it : it?.task || '')).filter(Boolean);
    const themeCounts = THEMES.map((t) => ({
      ...t,
      current: whatNeedsImprovement.filter((i) => t.re.test(i.text)).length,
      past: pastItems.filter((it) => t.re.test(it)).length,
    }));
    const recurringPatterns = themeCounts
      .filter((t) => t.current > 0 && t.past > 0)
      .map((t) => `🔁 **${t.label}**: raised ${t.current} time(s) this sprint and matches ${t.past} earlier action item(s).`);

    // Action items: one per theme raised this sprint; the team assigns owners in the retro.
    const actionItems = themeCounts
      .filter((t) => t.current > 0)
      .map((t) => ({
        task: `Agree a concrete fix for: ${t.label.toLowerCase()} (${t.current} item(s) raised)`,
        owner: 'Unassigned',
        category: t.key,
        evidence: whatNeedsImprovement.filter((i) => t.re.test(i.text)).map((i) => `${i.origin}: ${i.text}`).slice(0, 3),
        status: 'OPEN',
      }));
    const uncategorised = whatNeedsImprovement.filter((i) => !THEMES.some((t) => t.re.test(i.text)));
    if (uncategorised.length > 0) {
      actionItems.push({ task: `Discuss ${uncategorised.length} other improvement point(s)`, owner: 'Unassigned', category: 'OTHER', evidence: uncategorised.map((i) => `${i.origin}: ${i.text}`).slice(0, 3), status: 'OPEN' });
    }

    const fmtItem = (i) => `${i.text} _(${i.origin})_`;

    if (mode === 'LIST_RAW') {
      const listSummary = `### 📋 Retrospective Action Items: ${sprintName} (${actionItems.length})\n\n` +
        (actionItems.length > 0
          ? `| Action Item | Owner | Evidence | Status |\n| :--- | :--- | :--- | :---: |\n${actionItems.map((a) => `| **${a.task}** | ${a.owner} | ${a.evidence.join('<br>')} | ${a.status} |`).join('\n')}`
          : '> No action items: no improvement points were found in the available input.');
      return { mode: 'LIST_RAW', target: inputArgs.target || 'ALL', sprint_id: sprintId, total_items: actionItems.length, items: actionItems, summary: listSummary };
    }

    if (mode === 'DRILL_DOWN') {
      let drillSummary;
      if (inputArgs.target === 'PATTERNS') {
        drillSummary = `### 🔁 Recurring Patterns: ${sprintName}\n\n` + (recurringPatterns.length > 0 ? recurringPatterns.map((p) => `- ${p}`).join('\n') : '- No theme from this sprint matches an earlier action item.');
      } else if (inputArgs.target === 'FRICTION_POINTS') {
        drillSummary = `### ⚠️ Sprint Friction Points: ${sprintName}\n\n` + (whatNeedsImprovement.length > 0 ? whatNeedsImprovement.map((f) => `- ${fmtItem(f)}`).join('\n') : '- No friction points in the available input.');
      } else {
        drillSummary = `### 🎯 Retrospective Action Plan: ${sprintName}\n\n` + (actionItems.length > 0 ? actionItems.map((a) => `- **${a.task}** (owner: ${a.owner})\n  - Evidence: ${a.evidence.join('; ')}`).join('\n') : '- No action items.');
      }
      return { mode: 'DRILL_DOWN', target: inputArgs.target || 'ALL', sprint_id: sprintId, sprint_name: inputArgs.sprint_name || null, recurring_patterns: recurringPatterns, action_items: actionItems, summary: drillSummary };
    }

    // Optional Slack post (goes through the Slack tool's human-approval workflow).
    let slackPostStatus = null;
    if (inputArgs.post_to_slack && actionItems.length > 0) {
      try {
        const { executeMCPTool } = await import('../mcp/index.js');
        const channel = inputArgs.slack_channel || settingsService.getCachedSettings()?.mcp?.slack?.defaultChannel || '#engineering-retro';
        const postMessage = `🚀 *Retrospective action plan: ${sprintName}*\n\n${actionItems.map((a) => `• *${a.task}*`).join('\n')}\n\n_Owners to be agreed by the team._`;
        const postRes = await executeMCPTool('slack_post_message', { message: postMessage, channel, sprint_name: sprintName });
        let parsedPost = postRes;
        if (typeof postRes === 'string') {
          try { parsedPost = JSON.parse(postRes); } catch (_) { /* keep raw */ }
        }
        if (parsedPost?.status === 'PENDING_HUMAN_APPROVAL') {
          slackPostStatus = `⏳ Draft for \`${channel}\` is waiting for your approval (workflow \`${parsedPost.workflowId}\`).`;
        } else if (parsedPost?.status === 'SUCCESS') {
          slackPostStatus = `✅ Posted to \`${channel}\`.`;
        } else {
          slackPostStatus = `⚠️ Not posted: ${parsedPost?.error || parsedPost?.message || parsedPost?.status || 'unknown result'}`;
        }
      } catch (err) {
        slackPostStatus = `⚠️ Slack post failed: ${err.message}`;
      }
    } else if (inputArgs.post_to_slack) {
      slackPostStatus = 'ℹ️ Nothing posted: there are no action items.';
    }

    const summaryText = `### 🏆 What Went Well: ${sprintName}

${whatWentWell.length > 0 ? whatWentWell.map((w) => `- ${fmtItem(w)}`).join('\n') : '- No positive items in the available input.'}

### ⚠️ What Needs Improvement (${whatNeedsImprovement.length})

${whatNeedsImprovement.length > 0 ? whatNeedsImprovement.map((w) => `- ${fmtItem(w)}`).join('\n') : '- No improvement points in the available input.'}

<details>
<summary><b>🔍 Themes & Recurring Patterns</b></summary>

${themeCounts.filter((t) => t.current > 0).map((t) => `- **${t.label}**: ${t.current} item(s) this sprint${t.past > 0 ? `, ${t.past} matching earlier action item(s)` : ''}`).join('\n') || '- No themes detected.'}
${recurringPatterns.length > 0 ? `\n${recurringPatterns.map((p) => `- ${p}`).join('\n')}` : ''}

</details>

<details>
<summary><b>🎯 Draft Action Items (${actionItems.length})</b></summary>

${actionItems.length > 0 ? actionItems.map((a) => `- **${a.task}** — owner: ${a.owner}`).join('\n') : '- No action items.'}
${slackPostStatus ? `\n> 💬 **Slack**: ${slackPostStatus}` : ''}

</details>
`;

    return {
      mode: 'ANALYZE',
      sprint_id: sprintId,
      sprint_name: inputArgs.sprint_name || null,
      what_went_well: whatWentWell,
      what_needs_improvement: whatNeedsImprovement,
      recurring_patterns: recurringPatterns,
      extracted_action_items: actionItems,
      slack_post_status: slackPostStatus,
      summary: summaryText,
    };
  },
});

export function createRetroAgent(customTools = null, options = {}) {
  return createMicroAgent({
    name: 'retro_agent',
    defaultTool: sprintRetroTool,
    promptTemplate: retroAgentPromptTemplate,
    customTools,
    options,
  });
}


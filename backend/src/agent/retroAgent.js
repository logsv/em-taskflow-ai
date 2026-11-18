import { z } from 'zod';
import { retroAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import identityService from '../services/identityService.js';
import settingsService from '../services/settingsService.js';
import { warn } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool, createProvenanceNotice } from './baseAgent.js';

const RETRO_SOURCE_NAME = 'retro notes, Slack, GitHub, Jira & PostgreSQL sprint_analytics';

/** Friction themes used to cluster real retro inputs and detect recurrence across sprints. */
export const RETRO_THEMES = [
  { key: 'CI_RELIABILITY', label: 'CI/CD & Test Reliability', pattern: /\b(ci|cd|pipelines?|flaky|flakiness|tests?|builds?)\b/i },
  { key: 'CODE_REVIEW', label: 'Code Review Flow', pattern: /\b(reviews?|prs?|pull requests?|turnaround)\b/i },
  { key: 'SCOPE_CHURN', label: 'Scope & Unplanned Work', pattern: /\b(scope|churn|unplanned|escalations?|interrupt\w*|context switch\w*)\b/i },
  { key: 'DEPENDENCIES', label: 'Blockers & Dependencies', pattern: /\b(block\w*|dependenc\w*|waiting)\b/i },
  { key: 'INCIDENTS', label: 'Incidents & Production Quality', pattern: /\b(incidents?|outages?|bugs?|regressions?|hotfix\w*|sev\d?)\b/i },
];

const WIN_PATTERN = /\b(good|win|wins|well|proud|great|kudos|celebrat\w*|thanks?|thank you|shoutout|smooth)\b/i;
const FRICTION_PATTERN = /\b(slow|stuck|friction|bad|improve\w*|flaky|hard|block\w*|bugs?|issues?|delay\w*|broken|fail\w*)\b/i;

function itemText(item) {
  if (typeof item === 'string') return item;
  return item?.task || item?.text || '';
}

function themeOf(text) {
  return RETRO_THEMES.find((t) => t.pattern.test(text || '')) || { key: 'OTHER', label: 'Other' };
}

function classifyPolarity(text) {
  if (WIN_PATTERN.test(text)) return 'WIN';
  if (FRICTION_PATTERN.test(text)) return 'FRICTION';
  return 'UNCLASSIFIED';
}

function nextSprintLabel(sprintName) {
  const m = /^(.*?)(\d+)\s*$/.exec(sprintName || '');
  return m ? `${m[1]}${Number(m[2]) + 1}` : 'Next sprint';
}

/** Past sprints' recorded retro action items (excluding the sprint being analyzed), grouped per sprint. */
function collectPastRetros(analytics, inputArgs = {}) {
  const currentId = inputArgs?.sprint_id;
  const limit = inputArgs?.include_past_sprints_count || 3;
  return (Array.isArray(analytics) ? analytics : [])
    .filter((r) => r && r.sprint_id !== currentId)
    .slice(0, limit)
    .map((r) => {
      let items = r.retro_action_items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (_) { items = []; }
      }
      return {
        sprint_id: r.sprint_id,
        sprint_name: r.sprint_name || r.sprint_id,
        items: (Array.isArray(items) ? items : []).filter((it) => itemText(it).trim().length > 0),
      };
    });
}

export const sprintRetroTool = createDeterministicToolHarness({
  name: 'generate_sprint_retro',
  description: 'Synthesizes sprint delivery performance into structured retrospective notes, thematic friction clusters, multi-sprint recurring pattern detection, and SMART action items.',
  featureFlagKey: 'retro',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'notion', 'jira', 'github', 'slack']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    target: z.enum(['ALL', 'ACTION_ITEMS', 'PATTERNS', 'FRICTION_POINTS', 'WINS']).default('ALL'),
    sprint_id: z.string().default('sprint_42'),
    sprint_name: z.string().default('Sprint 42'),
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
              board_title: pages[0].title || null,
              board_url: pages[0].url || (configuredPageId ? `https://notion.so/${configuredPageId}` : null),
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
        if (!res || typeof res !== 'object' || res.error || res.status === 'UNAVAILABLE') {
          // Jira unreachable / not configured: report nothing rather than a misleading zero count.
          return null;
        }
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);

        return {
          total_incidents_reported: issues.length,
          recent_incidents: issues.slice(0, 3).map((iss) => ({
            key: iss.key,
            summary: iss.summary || iss.fields?.summary || null,
            status: iss.status || iss.fields?.status?.name || null,
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
        if (!res || typeof res !== 'object' || res.error) {
          // No live GitHub data: fall through to the DB tier rather than reporting invented metrics.
          return null;
        }
        const turnaround = Number(res.pr_turnaround_hours);
        const merged = Number(res.total_prs_merged);

        return {
          pr_turnaround_hours: Number.isFinite(turnaround) ? turnaround : null,
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
      const members = await databaseService.getTeamMembers().catch(() => []);
      const analytics = await databaseService.getSprintAnalytics().catch(() => []);
      const pastRetros = collectPastRetros(analytics, inputArgs);

      return {
        sprint_id: inputArgs.sprint_id || 'sprint_42',
        sprint_name: inputArgs.sprint_name || 'Sprint 42',
        team_members: members.map((m) => m.displayName),
        historical_retros_count: pastRetros.length,
        past_retros: pastRetros,
        past_retro_items: pastRetros.flatMap((r) => r.items),
        data_source: 'postgres_sprint_analytics',
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 3: PostgreSQL Database Snapshot Fallback
  dbCacheFallback: async (source, inputArgs = {}) => {
    try {
      const members = await databaseService.getTeamMembers().catch(() => []);
      const analytics = await databaseService.getSprintAnalytics().catch(() => []);
      const pastRetros = collectPastRetros(analytics, inputArgs);

      return {
        sprint_id: inputArgs?.sprint_id || 'sprint_42',
        sprint_name: inputArgs?.sprint_name || 'Sprint 42',
        team_members: members.map((m) => m.displayName),
        past_retros: pastRetros,
        past_retro_items: pastRetros.flatMap((r) => r.items),
        is_cached: true,
        data_source: 'postgres_sprint_analytics',
        synced_at: new Date().toISOString(),
      };
    } catch (_e) {
      return {
        sprint_id: inputArgs?.sprint_id || null,
        sprint_name: inputArgs?.sprint_name || null,
        team_members: [],
        past_retros: [],
        past_retro_items: [],
        is_cached: true,
        data_source: 'empty',
        data_availability: 'no_data',
      };
    }
  },
  // Thematic clustering, recurring-pattern detection and action items — built only from real inputs
  computeMath: async (sourceResults, inputArgs) => {
    const defaultResult = sourceResults.default;
    const defaultData = defaultResult?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';
    const target = inputArgs.target || 'ALL';
    const sprintId = inputArgs.sprint_id || defaultData.sprint_id || 'sprint_42';
    const sprintName = inputArgs.sprint_name || defaultData.sprint_name || 'Sprint 42';
    const rawNotes = inputArgs.retro_notes || '';
    const syncedAt = defaultData.synced_at || new Date().toISOString();
    const isCached = Boolean(defaultData.is_cached) || defaultResult?.tierUsed === 'TIER_3_DB_CACHE';

    const whatWentWell = [];
    const whatNeedsImprovement = [];
    const otherNotes = [];
    const deliverySignals = [];
    const inputSources = [];

    // 1. Raw retro notes supplied by the user
    const noteLines = rawNotes.split('\n').map((l) => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
    noteLines.forEach((l) => {
      const polarity = classifyPolarity(l);
      if (polarity === 'WIN') whatWentWell.push({ text: l, source: 'retro_notes' });
      else if (polarity === 'FRICTION') whatNeedsImprovement.push({ text: l, source: 'retro_notes' });
      else otherNotes.push({ text: l, source: 'retro_notes' });
    });
    if (noteLines.length > 0) inputSources.push(`retro notes (${noteLines.length} line(s))`);

    // 2. Slack retro channel messages
    const slackData = sourceResults.slack?.data || {};
    const slackMessages = slackData.source === 'mcp_slack' && Array.isArray(slackData.messages) ? slackData.messages : [];
    let slackUsed = 0;
    slackMessages.forEach((m) => {
      const text = (m.text || '').trim().replace(/^[-*•]\s*/, '');
      if (!text) return;
      const label = `Slack (${m.user || 'unknown user'})`;
      const polarity = classifyPolarity(text);
      if (polarity === 'WIN') { whatWentWell.push({ text, source: label }); slackUsed += 1; }
      else if (polarity === 'FRICTION') { whatNeedsImprovement.push({ text, source: label }); slackUsed += 1; }
    });
    if (slackMessages.length > 0) inputSources.push(`Slack ${slackData.channel || ''} (${slackMessages.length} message(s), ${slackUsed} classified)`.replace('  ', ' '));

    // 3. GitHub delivery telemetry (reported as measured signals, not classified as wins/friction)
    const githubData = sourceResults.github?.data || {};
    if (githubData.source === 'mcp_github') {
      if (Number.isFinite(githubData.total_prs_merged)) deliverySignals.push(`GitHub: ${githubData.total_prs_merged} PR(s) merged in the last 14 days`);
      if (Number.isFinite(githubData.pr_turnaround_hours)) deliverySignals.push(`GitHub: average PR turnaround ${githubData.pr_turnaround_hours}h over the last 14 days`);
      if (deliverySignals.length > 0) inputSources.push('GitHub DORA events (14d)');
    }

    // 4. Jira bugs / incidents
    const jiraData = sourceResults.jira?.data || {};
    if (jiraData.source === 'mcp_jira' && Array.isArray(jiraData.recent_incidents)) {
      inputSources.push(`Jira (${jiraData.total_incidents_reported} bug/incident ticket(s))`);
      const open = jiraData.recent_incidents.filter((t) => t.status && !/closed|resolved|done/i.test(t.status));
      const resolved = jiraData.recent_incidents.filter((t) => t.status && /closed|resolved|done/i.test(t.status));
      if (resolved.length > 0) whatWentWell.push({ text: `Resolved bug/incident tickets: ${resolved.map((t) => t.key).join(', ')}`, source: 'Jira' });
      if (open.length > 0) whatNeedsImprovement.push({ text: `Bug/incident tickets still open: ${open.map((t) => `${t.key}${t.summary ? ` (${t.summary})` : ''}`).join(', ')}`, source: 'Jira' });
    }

    // 5. Recurring patterns from real past retro action items (grouped per sprint)
    const pastRetros = Array.isArray(defaultData.past_retros)
      ? defaultData.past_retros
      : (Array.isArray(defaultData.past_retro_items) && defaultData.past_retro_items.length > 0
        ? [{ sprint_id: 'past', items: defaultData.past_retro_items }]
        : []);
    const pastWithItems = pastRetros.filter((r) => Array.isArray(r.items) && r.items.length > 0);
    if (pastWithItems.length > 0) inputSources.push(`PostgreSQL sprint_analytics (${pastWithItems.length} past retro(s))`);

    const currentFrictionThemes = new Set(whatNeedsImprovement.map((f) => themeOf(f.text).key));
    const recurringPatternDetails = RETRO_THEMES.map((theme) => {
      const sprintsWithTheme = pastWithItems.filter((r) => r.items.some((it) => themeOf(itemText(it)).key === theme.key));
      const inCurrent = currentFrictionThemes.has(theme.key);
      const occurrences = sprintsWithTheme.length + (inCurrent ? 1 : 0);
      return { theme, sprintsWithTheme, inCurrent, occurrences };
    }).filter((p) => p.occurrences >= 2);

    const recurringPatterns = recurringPatternDetails.map((p) => {
      const sprintList = p.sprintsWithTheme.map((r) => r.sprint_name || r.sprint_id).join(', ');
      return `🔁 **${p.theme.label}**: raised in ${p.sprintsWithTheme.length} of the last ${pastWithItems.length} recorded retro(s) (${sprintList})${p.inCurrent ? ' and again in this sprint' : ''}.`;
    });

    // 6. Action items derived from the actual friction points (owners are not invented)
    const nextSprint = nextSprintLabel(sprintName);
    const recurringKeys = new Set(recurringPatternDetails.map((p) => p.theme.key));
    const smartActionItems = whatNeedsImprovement.slice(0, 6).map((f) => {
      const theme = themeOf(f.text);
      const recurring = recurringKeys.has(theme.key);
      return {
        task: `Agree a fix for: ${f.text}`,
        owner: null,
        owner_status: 'UNASSIGNED',
        category: theme.key,
        source: f.source,
        target_sprint: nextSprint,
        success_metric: recurring
          ? `"${theme.label}" is not raised again at the ${nextSprint} retro (currently recurring)`
          : `Friction point is not raised again at the ${nextSprint} retro`,
        status: 'OPEN',
      };
    });

    const hasAnyInput = inputSources.length > 0;
    const status = hasAnyInput ? 'OK' : 'NO_DATA';
    const provenanceNotice = hasAnyInput
      ? createProvenanceNotice(isCached, syncedAt, RETRO_SOURCE_NAME)
      : `> ⚠️ **Notice**: No retro inputs (${RETRO_SOURCE_NAME}) were available as of \`${syncedAt}\`.`;
    const noInputText = 'No retro notes, Slack retro messages, GitHub/Jira telemetry, or past retro items were available, so no wins, friction points, patterns, or action items can be reported.';
    const fmtItem = (i) => `${i.source === 'retro_notes' ? '' : `**${i.source}**: `}${i.text}`;
    const baseResult = {
      sprint_id: sprintId,
      sprint_name: sprintName,
      status,
      input_sources: inputSources,
      provenance: { source: RETRO_SOURCE_NAME, is_cached: isCached, synced_at: syncedAt },
    };

    if (mode === 'LIST_RAW') {
      const actionRows = smartActionItems.map((a) => `| **${a.task}** | Unassigned | \`${a.target_sprint}\` | ${a.success_metric} | 🟢 ${a.status} |`);
      const listSummary = `### 📋 Retrospective Action Items: ${sprintName} (${smartActionItems.length} Actions)\n\n` +
        (smartActionItems.length > 0
          ? '| Action Item Task | Owner | Target Milestone | Success Metric | Status |\n| :--- | :--- | :--- | :--- | :---: |\n' + actionRows.join('\n')
          : (hasAnyInput ? 'No friction points were found in the available inputs, so no action items were derived.' : noInputText)) +
        `\n\n${provenanceNotice}`;

      return {
        ...baseResult,
        mode: 'LIST_RAW',
        target,
        total_items: smartActionItems.length,
        items: smartActionItems,
        summary: listSummary,
      };
    }

    if (mode === 'DRILL_DOWN') {
      let drillSummary = '';
      if (target === 'PATTERNS') {
        drillSummary = `### 🔁 Chronic Multi-Sprint Recurring Patterns: ${sprintName}\n\n` +
          (recurringPatterns.length > 0
            ? recurringPatterns.map((p) => `- ${p}`).join('\n')
            : (pastWithItems.length > 0
              ? `No theme appears in two or more of the ${pastWithItems.length} recorded retro(s) and this sprint.`
              : 'No past retro action items are recorded, so recurring patterns cannot be detected.'));
      } else if (target === 'FRICTION_POINTS') {
        drillSummary = `### ⚠️ Sprint Friction Points: ${sprintName}\n\n` +
          (whatNeedsImprovement.length > 0 ? whatNeedsImprovement.map((f) => `- ${fmtItem(f)}`).join('\n') : (hasAnyInput ? 'No friction points found in the available inputs.' : noInputText));
      } else if (target === 'WINS') {
        drillSummary = `### 🏆 Sprint Wins: ${sprintName}\n\n` +
          (whatWentWell.length > 0 ? whatWentWell.map((w) => `- ${fmtItem(w)}`).join('\n') : (hasAnyInput ? 'No wins found in the available inputs.' : noInputText));
      } else {
        drillSummary = `### 🎯 Targeted Retrospective Action Plan: ${sprintName}\n\n` +
          (smartActionItems.length > 0
            ? smartActionItems.map((a) => `- **${a.task}** (Owner: unassigned, Target: \`${a.target_sprint}\`)\n  *Success Metric*: ${a.success_metric}`).join('\n\n')
            : (hasAnyInput ? 'No friction points were found, so no action items were derived.' : noInputText));
      }

      return {
        ...baseResult,
        mode: 'DRILL_DOWN',
        target,
        recurring_patterns: recurringPatterns,
        action_items: smartActionItems,
        summary: `${drillSummary}\n\n${provenanceNotice}`,
      };
    }

    // Optional: post the action plan to Slack (only when there is a real plan to post)
    let slackPostStatus = null;
    if (inputArgs.post_to_slack) {
      if (smartActionItems.length === 0) {
        slackPostStatus = 'ℹ️ Nothing posted to Slack: no action items were derived for this sprint.';
      } else {
        try {
          const { executeMCPTool } = await import('../mcp/index.js');
          const channel = inputArgs.slack_channel || settingsService.getCachedSettings()?.mcp?.slack?.defaultChannel || '#engineering-retro';
          const focusThemes = [...new Set(smartActionItems.map((a) => RETRO_THEMES.find((t) => t.key === a.category)?.label).filter(Boolean))];
          const postLines = smartActionItems.map((a) => `• *${a.task}* — owner to be agreed (${a.target_sprint}) [Metric: ${a.success_metric}]`);
          const postMessage = `🚀 *Sprint Retrospective Action Plan: ${sprintName}*\n\n` +
            (focusThemes.length > 0 ? `*Key Focus*: ${focusThemes.join(' & ')}\n\n` : '') +
            `*Action Items*:\n${postLines.join('\n')}\n\n` +
            '_Generated by EM TaskFlow AI Retro Specialist_';

          const postRes = await executeMCPTool('slack_post_message', {
            message: postMessage,
            channel,
            sprint_name: sprintName,
          });
          let parsedPost = postRes;
          if (typeof postRes === 'string') {
            try { parsedPost = JSON.parse(postRes); } catch (_) { /* keep raw string */ }
          }

          if (parsedPost?.status === 'PENDING_HUMAN_APPROVAL') {
            slackPostStatus = `⏳ **Temporal HITL Approval Pending**: Draft retrospective action plan created for \`${channel}\` (Workflow ID: \`${parsedPost.workflowId}\`). Requires human confirmation before posting.`;
          } else if (parsedPost?.status === 'SUCCESS') {
            slackPostStatus = `✅ Successfully posted retrospective action plan to Slack channel \`${channel}\``;
          } else if (parsedPost?.status === 'SIMULATED') {
            slackPostStatus = `ℹ️ Simulated post to Slack channel \`${channel}\` (Slack token unconfigured)`;
          } else {
            slackPostStatus = `⚠️ Slack post notice: ${parsedPost?.error || parsedPost?.message || 'Unable to post'}`;
          }
        } catch (err) {
          slackPostStatus = `⚠️ Slack post failed: ${err.message}`;
        }
      }
    }

    const slackNotice = slackPostStatus ? `\n\n> 💬 **Slack Integration**: ${slackPostStatus}` : '';

    if (!hasAnyInput) {
      return {
        ...baseResult,
        mode: 'ANALYZE',
        what_went_well: [],
        what_needs_improvement: [],
        other_notes: [],
        delivery_signals: [],
        recurring_patterns: [],
        friction_themes: [],
        extracted_action_items: [],
        slack_post_status: slackPostStatus,
        summary: `### 🏆 Sprint Achievements & Team Kudos (What Went Well): ${sprintName}\n\n${noInputText}${slackNotice}\n\n${provenanceNotice}`,
      };
    }

    const frictionThemes = RETRO_THEMES.map((t) => ({
      theme: t.label,
      key: t.key,
      count: whatNeedsImprovement.filter((f) => themeOf(f.text).key === t.key).length,
      recurring: recurringKeys.has(t.key),
    })).filter((t) => t.count > 0);
    const otherFriction = whatNeedsImprovement.filter((f) => themeOf(f.text).key === 'OTHER').length;
    if (otherFriction > 0) frictionThemes.push({ theme: 'Other', key: 'OTHER', count: otherFriction, recurring: false });

    const topTheme = [...frictionThemes].sort((a, b) => b.count - a.count)[0];

    const summaryText = `### 🏆 Sprint Achievements & Team Kudos (What Went Well): ${sprintName}

${whatWentWell.length > 0 ? whatWentWell.map((w) => `- ${fmtItem(w)}`).join('\n') : '- No wins were found in the available inputs.'}
${deliverySignals.length > 0 ? `\n**Measured Delivery Signals**:\n${deliverySignals.map((d) => `- ${d}`).join('\n')}\n` : ''}
> 💡 **Bottom Line**: ${whatWentWell.length} win(s) and ${whatNeedsImprovement.length} friction point(s) from ${inputSources.join(', ')}.${topTheme ? ` Most frequent friction theme: **${topTheme.theme}**.` : ''}

<details>
<summary><b>🔍 Friction Points & Thematic Clustering (${whatNeedsImprovement.length} Items)</b></summary>

${frictionThemes.length > 0 ? `| Friction Theme | Items | Recurring Across Sprints |\n| :--- | :---: | :---: |\n${frictionThemes.map((t) => `| **${t.theme}** | ${t.count} | ${t.recurring ? '🔁 Yes' : 'No'} |`).join('\n')}\n` : ''}
${whatNeedsImprovement.length > 0 ? whatNeedsImprovement.map((w) => `- ${fmtItem(w)}`).join('\n') : '- No friction points were found in the available inputs.'}
${otherNotes.length > 0 ? `\n**Other Notes (unclassified)**:\n${otherNotes.map((n) => `- ${n.text}`).join('\n')}\n` : ''}
- **Recurring Multi-Sprint Patterns**:
${recurringPatterns.length > 0 ? recurringPatterns.map((p) => `  * ${p}`).join('\n') : (pastWithItems.length > 0 ? '  * No theme recurs across the recorded retros and this sprint.' : '  * No past retro items recorded; recurring patterns cannot be detected.')}

</details>

<details>
<summary><b>🎯 Continuous Improvement Action Plan (${smartActionItems.length} Items)</b></summary>

${smartActionItems.length > 0 ? `| Action Item | Owner | Target Checkpoint | Success Metric |\n| :--- | :---: | :---: | :--- |\n${smartActionItems.map((a) => `| **${a.task}** | Unassigned | ${a.target_sprint} | ${a.success_metric} |`).join('\n')}\n\n- **Owners**: to be agreed by the team during the retro; none are auto-assigned.` : '- No action items: no friction points were found.'}${slackNotice}

</details>

${provenanceNotice}
`;

    return {
      ...baseResult,
      mode: 'ANALYZE',
      what_went_well: whatWentWell.map(fmtItem),
      what_needs_improvement: whatNeedsImprovement.map(fmtItem),
      other_notes: otherNotes.map((n) => n.text),
      delivery_signals: deliverySignals,
      recurring_patterns: recurringPatterns,
      friction_themes: frictionThemes,
      extracted_action_items: smartActionItems,
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


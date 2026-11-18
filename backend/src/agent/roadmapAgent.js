import { z } from 'zod';
import { roadmapAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import identityService from '../services/identityService.js';
import { getDirectOrFormattedJiraUrl, formatMarkdownLinkOrCode } from '../utils/urlHelper.js';
import { warn } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool, createProvenanceNotice } from './baseAgent.js';

const ROADMAP_SOURCE_NAME = 'Live Jira epics';
const DAY_MS = 24 * 60 * 60 * 1000;

function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIsoDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

/** Whole UTC days from `fromIso` to `toDate` (positive when `toDate` is later). */
function daysBetween(fromIso, toDate) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate());
  return Math.round((to - from) / DAY_MS);
}

/**
 * Maps a Jira epic (raw REST `fields` shape, or the flattened shape returned by the
 * native `jira_search` tool) to the roadmap epic shape. Only values that are present
 * on the issue are carried over; everything else is null — never a placeholder.
 */
export function mapJiraEpic(iss) {
  const f = iss?.fields || {};
  const assignee = f.assignee?.displayName ?? (typeof iss.assignee === 'string' ? iss.assignee : iss.assignee?.displayName);
  const owner = assignee && !/^unassigned$/i.test(assignee) ? assignee : null;

  const linkedBlockers = (Array.isArray(f.issuelinks) ? f.issuelinks : [])
    .filter((l) => l?.type?.inward === 'is blocked by' && l.inwardIssue?.key)
    .filter((l) => (l.inwardIssue.fields?.status?.statusCategory?.key || '') !== 'done')
    .map((l) => (l.inwardIssue.fields?.summary ? `${l.inwardIssue.key} (${l.inwardIssue.fields.summary})` : l.inwardIssue.key));
  const flatBlockers = typeof iss.blocked_by === 'string' && iss.blocked_by.trim()
    ? iss.blocked_by.split(',').map((k) => k.trim()).filter(Boolean)
    : [];

  const status = f.status?.name || (typeof iss.status === 'string' ? iss.status : iss.status?.name) || null;
  const statusCategory = f.status?.statusCategory?.key || null;

  return {
    key: iss.key || null,
    summary: f.summary || iss.summary || null,
    status: status && status !== 'Unknown' ? status : null,
    status_category: statusCategory,
    progress_pct: toFiniteOrNull(f.aggregateprogress?.percent ?? iss.progress_pct),
    story_points: toFiniteOrNull(f.customfield_10016 ?? iss.story_points),
    target_date: toIsoDateOrNull(f.duedate ?? iss.due_date ?? iss.duedate),
    created_date: toIsoDateOrNull(f.created ?? iss.created),
    owner,
    blockers: linkedBlockers.length > 0 ? linkedBlockers : flatBlockers,
    url: iss.url || iss.browseUrl || null,
  };
}

function isEpicDone(epic) {
  return epic.status_category === 'done'
    || /^(done|closed|resolved|released|complete(d)?)$/i.test(epic.status || '')
    || epic.progress_pct === 100;
}

/**
 * Classifies a single epic using only its real fields.
 * - drift_days: days past the Jira due date for unfinished epics (0 when not yet due, null without a due date).
 * - time_elapsed_pct: share of the created→due window already elapsed (null when either date is missing).
 */
function analyzeEpic(epic, today) {
  const done = isEpicDone(epic);
  const hasTarget = Boolean(epic.target_date);
  const daysPastDue = hasTarget ? daysBetween(epic.target_date, today) : null;
  const driftDays = hasTarget ? (done ? 0 : Math.max(0, daysPastDue)) : null;

  let timeElapsedPct = null;
  if (hasTarget && epic.created_date) {
    const windowDays = daysBetween(epic.created_date, new Date(`${epic.target_date}T00:00:00Z`));
    const elapsedDays = daysBetween(epic.created_date, today);
    if (windowDays > 0) timeElapsedPct = Math.min(100, Math.max(0, Math.round((elapsedDays / windowDays) * 100)));
  }

  let health;
  const reasons = [];
  if (done) {
    health = 'DONE';
  } else if (epic.blockers.length > 0) {
    health = 'BLOCKED';
    reasons.push(`blocked by ${epic.blockers.join(', ')}`);
  } else if (driftDays !== null && driftDays > 0) {
    health = 'OVERDUE';
  } else if (timeElapsedPct !== null && epic.progress_pct !== null && epic.progress_pct + 20 < timeElapsedPct) {
    health = 'AT_RISK';
  } else if (!hasTarget && epic.progress_pct === null) {
    health = 'UNKNOWN';
  } else {
    health = 'ON_TRACK';
  }

  if (driftDays !== null && driftDays > 0) reasons.push(`${driftDays} day(s) past due date ${epic.target_date}`);
  if (health === 'AT_RISK') reasons.push(`${epic.progress_pct}% complete with ${timeElapsedPct}% of its schedule elapsed`);

  return {
    ...epic,
    drift_days: driftDays,
    time_elapsed_pct: timeElapsedPct,
    health_status: health,
    health_reasons: reasons,
  };
}

const HEALTH_BADGE = {
  DONE: '✅ Done',
  ON_TRACK: '🟢 On Track',
  AT_RISK: '🟡 At Risk',
  OVERDUE: '🔴 Overdue',
  BLOCKED: '🔴 Blocked',
  UNKNOWN: '⚪ Unknown',
};

const fmt = (v, suffix = '') => (v === null || v === undefined ? 'n/a' : `${v}${suffix}`);
const epicLink = (e) => formatMarkdownLinkOrCode(e.key, getDirectOrFormattedJiraUrl(e));

/** Recommendations derived strictly from the retrieved epics. */
function buildRecommendations(analyzedEpics) {
  const recs = [];
  analyzedEpics.filter((e) => e.health_status === 'BLOCKED').forEach((e) => {
    recs.push({ priority: 'P0', epic: e.key, action: `Unblock ${e.key}: resolve upstream dependency ${e.blockers.join(', ')}${e.owner ? ` (owner: ${e.owner})` : ''}.` });
  });
  analyzedEpics.filter((e) => e.health_status === 'OVERDUE').forEach((e) => {
    recs.push({ priority: 'P1', epic: e.key, action: `Re-baseline ${e.key}: ${e.drift_days} day(s) past its ${e.target_date} due date at ${fmt(e.progress_pct, '%')} complete — confirm a new target date or de-scope.` });
  });
  analyzedEpics.filter((e) => e.health_status === 'AT_RISK').forEach((e) => {
    recs.push({ priority: 'P1', epic: e.key, action: `Review pacing on ${e.key}: ${e.progress_pct}% complete with ${e.time_elapsed_pct}% of its schedule elapsed (due ${e.target_date}).` });
  });
  const missingDates = analyzedEpics.filter((e) => e.health_status !== 'DONE' && !e.target_date).map((e) => e.key);
  if (missingDates.length > 0) {
    recs.push({ priority: 'P2', epic: null, action: `Set Jira due dates on ${missingDates.join(', ')} so milestone drift can be measured.` });
  }
  const missingOwners = analyzedEpics.filter((e) => e.health_status !== 'DONE' && !e.owner).map((e) => e.key);
  if (missingOwners.length > 0) {
    recs.push({ priority: 'P2', epic: null, action: `Assign an owner to ${missingOwners.join(', ')}.` });
  }
  return recs;
}

function emptyRoadmapResult({ mode, target, quarter, initiativeId, provenance, reason }) {
  const summary = `### 🗺️ Roadmap Alignment: ${quarter}\n\n` +
    `No roadmap epics were retrieved for **${quarter}** (${initiativeId}). ${reason} ` +
    'Epics are sourced only from live Jira; there is no PostgreSQL epic snapshot to fall back to, ' +
    'so no progress, drift, or blocker analysis can be computed.\n\n' +
    `> ⚠️ **Notice**: No ${ROADMAP_SOURCE_NAME.toLowerCase()} available as of \`${provenance.synced_at}\`.`;

  return {
    mode,
    target,
    quarter,
    initiative_id: initiativeId,
    status: 'NO_DATA',
    epics: [],
    items: [],
    total_epics: 0,
    epics_count: 0,
    blockers: [],
    recommendations: [],
    overall_health: 'NO_DATA',
    overall_progress_pct: null,
    scope_creep_pct: null,
    total_story_points: null,
    provenance,
    summary,
  };
}

export const roadmapAlignmentTool = createDeterministicToolHarness({
  name: 'get_roadmap_alignment',
  description: 'Evaluates project milestone timelines, epic roadmap dependencies, cross-team blockers, and initiative drift against high-level product goals and release quarters.',
  featureFlagKey: 'roadmap',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'jira', 'notion', 'linear']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    target: z.enum(['ALL', 'EPICS', 'BLOCKERS', 'DRIFT', 'MILESTONES']).default('ALL'),
    initiative_id: z.string().default('q4_roadmap'),
    quarter: z.string().default('Q4'),
    target_date: z.string().optional().describe('Target completion or milestone date (YYYY-MM-DD)'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Live MCP & Multi-Source Executors
  mcpExecutors: {
    jira: async (_inputArgs) => {
      try {
        const res = await safeExecuteMCPTool('jira_search', { jql: 'issuetype = Epic AND fixVersion in unreleasedVersions()' });
        if (!res || typeof res !== 'object' || res.error || res.status === 'UNAVAILABLE') return null;
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);

        if (issues.length > 0) {
          const epics = issues.map(mapJiraEpic).filter((e) => e.key);
          return {
            epics_count: epics.length,
            epics,
            source: 'mcp_jira',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'roadmapHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    notion: async (_inputArgs) => {
      try {
        const res = await safeExecuteMCPTool('notion_search', { query: 'Quarterly Product Roadmap Strategy Brief' });

        if (res) {
          const pages = Array.isArray(res) ? res : (Array.isArray(res.results) ? res.results : []);
          if (pages.length > 0) {
            return {
              strategy_doc_found: true,
              title: pages[0].title || null,
              url: pages[0].url || null,
              source: 'mcp_notion',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (err) {
        warn({ module: 'roadmapHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    linear: async (_inputArgs) => {
      return null;
    },
    default: async (inputArgs) => {
      const q = inputArgs.quarter || 'Q4';
      const okrs = (databaseService.getOkrsByQuarter ? await databaseService.getOkrsByQuarter(q).catch(() => []) : await databaseService.getOkrRecords(q).catch(() => [])) || [];
      const members = await identityService.getTeamMembers().catch(() => []);

      return {
        initiative_id: inputArgs.initiative_id || 'q4_roadmap',
        quarter: q,
        okrs_count: okrs.length,
        team_size: members.length,
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 3: PostgreSQL fallback. There is no persisted epic store, so no epics are ever
  // reported from here; only the OKR count (which is real PostgreSQL data) is returned.
  dbCacheFallback: async (source, inputArgs = {}) => {
    const quarter = inputArgs.quarter || 'Q4';
    const okrs = (databaseService.getOkrsByQuarter ? await databaseService.getOkrsByQuarter(quarter).catch(() => []) : await databaseService.getOkrRecords(quarter).catch(() => [])) || [];

    return {
      initiative_id: inputArgs.initiative_id || 'q4_roadmap',
      quarter,
      requested_source: source,
      status: 'NO_DATA',
      epics: [],
      okr_count: okrs.length,
      strategy_doc_found: false,
      source: 'postgres_okr_tracker',
      is_cached: true,
      staleDataWarning: true,
      synced_at: new Date().toISOString(),
    };
  },
  // Deterministic drift / blocker analysis over the retrieved epics
  computeMath: async (sourceResults, inputArgs) => {
    const jiraResult = sourceResults.jira;
    const jiraData = jiraResult?.data;
    const notionData = sourceResults.notion?.data;
    const mode = inputArgs.mode || 'ANALYZE';
    const target = inputArgs.target || 'ALL';
    const quarter = inputArgs.quarter || 'Q4';
    const initiativeId = inputArgs.initiative_id || 'q4_roadmap';

    const isLiveJira = jiraData?.source === 'mcp_jira' && Array.isArray(jiraData.epics);
    const epics = isLiveJira ? jiraData.epics : [];
    const syncedAt = (isLiveJira && jiraData.synced_at) || new Date().toISOString();
    const provenance = {
      source: ROADMAP_SOURCE_NAME,
      is_cached: !isLiveJira,
      jira_tier: jiraResult?.tierUsed || 'NOT_REQUESTED',
      synced_at: syncedAt,
    };

    if (epics.length === 0) {
      const reason = !jiraResult
        ? 'The Jira source was not requested.'
        : 'Live Jira returned no epics (unreachable, not configured, or no epics in unreleased versions).';
      return emptyRoadmapResult({ mode, target, quarter, initiativeId, provenance, reason });
    }

    const today = new Date();
    const analyzedEpics = epics.map((e) => analyzeEpic(e, today));
    const provenanceNotice = createProvenanceNotice(false, syncedAt, `${ROADMAP_SOURCE_NAME} (jira_search)`);

    const blockersList = analyzedEpics
      .filter((e) => e.health_status === 'BLOCKED')
      .map((e) => ({
        epic: e.key,
        summary: e.summary,
        owner: e.owner,
        blocker_description: e.blockers.join('; '),
        blocked_by: e.blockers.map((b) => b.split(' ')[0]),
      }));

    if (mode === 'LIST_RAW') {
      const epicRows = analyzedEpics.map((e) => `| ${epicLink(e)} | ${e.summary ? `**${e.summary}**` : 'n/a'} | **${fmt(e.progress_pct, '%')}** | ${e.owner ? `\`@${e.owner}\`` : 'Unassigned'} | ${e.target_date ? `\`${e.target_date}\`` : 'n/a'} | ${HEALTH_BADGE[e.health_status]} |`);
      const listSummary = `### 🗺️ Quarterly Roadmap Epics: ${quarter} (${analyzedEpics.length} Epics)\n\n` +
        '| Epic Key | Summary | Progress | Owner | Target Date | Status |\n| :--- | :--- | :---: | :--- | :---: | :---: |\n' +
        epicRows.join('\n') +
        `\n\n${provenanceNotice}`;

      return {
        mode: 'LIST_RAW',
        target,
        quarter,
        initiative_id: initiativeId,
        status: 'OK',
        items: analyzedEpics,
        total_epics: analyzedEpics.length,
        provenance,
        summary: listSummary,
      };
    }

    if (mode === 'DRILL_DOWN') {
      let drillSummary = '';
      if (target === 'BLOCKERS') {
        drillSummary = `### 🚫 Cross-Team Technical Blockers: ${quarter}\n\n` +
          (blockersList.length > 0
            ? blockersList.map((b) => `- **[${b.epic}]**${b.summary ? ` ${b.summary}` : ''}: blocked by ${b.blocker_description}`).join('\n')
            : '🟢 **Zero Active Blockers**: No retrieved epic has an open "is blocked by" link.');
      } else if (target === 'DRIFT') {
        drillSummary = `### ⏱️ Roadmap Milestone Drift: ${quarter}\n\n` +
          analyzedEpics.map((e) => {
            if (e.health_status === 'DONE') return `- **${e.key}**: Done`;
            if (e.drift_days === null) return `- **${e.key}**: No Jira due date — drift cannot be measured`;
            return e.drift_days > 0
              ? `- **${e.key}**: **${e.drift_days} day(s) overdue** (due \`${e.target_date}\`, ${fmt(e.progress_pct, '%')} complete)`
              : `- **${e.key}**: Not yet due (due \`${e.target_date}\`, ${fmt(e.progress_pct, '%')} complete)`;
          }).join('\n');
      } else {
        drillSummary = `### 🎯 Targeted Epic Alignment Breakdown: ${quarter}\n\n` +
          analyzedEpics.map((e) => `- **${e.key}**: ${e.summary || 'n/a'} (${fmt(e.progress_pct, '%')} complete, Target: ${e.target_date ? `\`${e.target_date}\`` : 'n/a'})\n  *Owner*: ${e.owner ? `\`@${e.owner}\`` : 'Unassigned'} | *Status*: ${e.status || 'n/a'} | *Health*: ${HEALTH_BADGE[e.health_status]}`).join('\n\n');
      }

      return {
        mode: 'DRILL_DOWN',
        target,
        quarter,
        initiative_id: initiativeId,
        status: 'OK',
        epics_count: analyzedEpics.length,
        epics: analyzedEpics,
        blockers: blockersList,
        provenance,
        summary: `${drillSummary}\n\n${provenanceNotice}`,
      };
    }

    // Aggregate progress: story-point weighted when every epic with progress is estimated, else a plain mean.
    const withProgress = analyzedEpics.filter((e) => e.progress_pct !== null);
    let overallProgressPct = null;
    if (withProgress.length > 0) {
      const allEstimated = withProgress.every((e) => e.story_points !== null && e.story_points > 0);
      if (allEstimated) {
        const weight = withProgress.reduce((acc, e) => acc + e.story_points, 0);
        overallProgressPct = Math.round(withProgress.reduce((acc, e) => acc + e.progress_pct * e.story_points, 0) / weight);
      } else {
        overallProgressPct = Math.round(withProgress.reduce((acc, e) => acc + e.progress_pct, 0) / withProgress.length);
      }
    }

    const estimated = analyzedEpics.filter((e) => e.story_points !== null);
    const totalStoryPoints = estimated.length > 0 ? estimated.reduce((acc, e) => acc + e.story_points, 0) : null;
    const unestimated = analyzedEpics.filter((e) => e.story_points === null).map((e) => e.key);
    const overdueEpics = analyzedEpics.filter((e) => e.health_status === 'OVERDUE');
    const atRiskEpics = analyzedEpics.filter((e) => e.health_status === 'AT_RISK');
    const maxDrift = analyzedEpics.reduce((acc, e) => (e.drift_days !== null && e.drift_days > acc ? e.drift_days : acc), 0);

    let overallHealth;
    if (overdueEpics.length > 0) overallHealth = 'DELAYED';
    else if (blockersList.length > 0 || atRiskEpics.length > 0) overallHealth = 'AT_RISK';
    else if (analyzedEpics.every((e) => e.health_status === 'UNKNOWN')) overallHealth = 'UNKNOWN';
    else overallHealth = 'ON_TRACK';

    const recommendations = buildRecommendations(analyzedEpics);
    const healthLabel = { ON_TRACK: '🟢 ON TRACK', AT_RISK: '🟡 AT RISK', DELAYED: '🔴 DELAYED', UNKNOWN: '⚪ UNKNOWN' }[overallHealth];

    const markdownSummary = `
### 🎯 Executive Milestone Health & Pacing Summary
- **Target Release Horizon**: **${quarter} Initiative Roadmap** (${initiativeId})
- **Overall Strategic Health**: **${healthLabel}**
- **Aggregate Progress**: **${fmt(overallProgressPct, '% Complete')}** across ${analyzedEpics.length} epic(s)${withProgress.length < analyzedEpics.length ? ` (${analyzedEpics.length - withProgress.length} without Jira progress data)` : ''}
- **Overdue Epics**: **${overdueEpics.length}**${maxDrift > 0 ? ` (max drift ${maxDrift} day(s) past due)` : ''}
- **Active Critical Blockers**: **${blockersList.length} dependency bottleneck(s)**

---

### 📊 Epic Progress & Timeline Breakdown
| Epic Key | Epic Summary | Owner | Progress | Story Points | Target Date | Drift (days overdue) | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
${analyzedEpics.map((e) => `| ${epicLink(e)} | ${e.summary || 'n/a'} | ${e.owner || 'Unassigned'} | ${fmt(e.progress_pct, '%')} | ${fmt(e.story_points)} | ${e.target_date ? `\`${e.target_date}\`` : 'n/a'} | ${fmt(e.drift_days)} | ${HEALTH_BADGE[e.health_status]} |`).join('\n')}

---

### 🔗 Cross-Team Technical Dependencies & Critical Path Blockers
${blockersList.length > 0 ? blockersList.map((b) => `- ⚠️ **[${b.epic}]${b.summary ? ` ${b.summary}` : ''}**${b.owner ? ` (${b.owner})` : ''}:\n  - **Upstream Blocker**: ${b.blocker_description}`).join('\n') : '- ✅ No retrieved epic has an open "is blocked by" dependency.'}

---

### 📈 Scope Creep & Velocity Risk Audit
- **Scope Creep**: not computed — Jira does not provide a planning-time point baseline for these epics.
- **Current Estimate**: ${totalStoryPoints === null ? 'n/a (no epics are estimated)' : `**${totalStoryPoints} pts** across ${estimated.length} estimated epic(s)`}${unestimated.length > 0 ? `; unestimated: ${unestimated.join(', ')}` : ''}.
- **Schedule Risk**: ${overdueEpics.length + atRiskEpics.length > 0 ? [...overdueEpics, ...atRiskEpics].map((e) => `\`${e.key}\` (${e.health_reasons.join('; ')})`).join(', ') : 'No retrieved epic is overdue or behind its schedule window.'}

---

### 🛠️ Recommended De-risking & Re-alignment Actions
${recommendations.length > 0 ? recommendations.map((r, i) => `${i + 1}. **(${r.priority})** ${r.action}`).join('\n') : '- No de-risking actions required: no retrieved epic is blocked, overdue, at risk, or missing a due date/owner.'}

---

### 📌 Data Provenance
- **Telemetry Sources**: Live Jira epics${notionData?.source === 'mcp_notion' && notionData.strategy_doc_found ? ` & Notion strategy doc${notionData.title ? ` "${notionData.title}"` : ''}${notionData.url ? ` (${notionData.url})` : ''}` : ''}

${provenanceNotice}
`.trim();

    return {
      mode: 'ANALYZE',
      target,
      initiative_id: initiativeId,
      quarter,
      status: 'OK',
      overall_health: overallHealth,
      overall_progress_pct: overallProgressPct,
      scope_creep_pct: null,
      total_story_points: totalStoryPoints,
      max_drift_days: maxDrift,
      epics: analyzedEpics,
      blockers: blockersList,
      recommendations,
      provenance,
      summary: markdownSummary,
    };
  },
});

export function createRoadmapAgent(customTools = null, options = {}) {
  return createMicroAgent({
    name: 'roadmap_agent',
    defaultTool: roadmapAlignmentTool,
    promptTemplate: roadmapAgentPromptTemplate,
    customTools,
    options,
  });
}

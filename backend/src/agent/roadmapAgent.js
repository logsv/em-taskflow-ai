import { z } from 'zod';
import { roadmapAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import identityService from '../services/identityService.js';
import { getDirectOrFormattedJiraUrl, formatMarkdownLinkOrCode } from '../utils/urlHelper.js';
import { info, warn, error } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool } from './baseAgent.js';

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
    jira: async (inputArgs) => {
      try {
        const res = await safeExecuteMCPTool('jira_search', { jql: 'issuetype = Epic AND fixVersion in unreleasedVersions()' });
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);

        if (issues.length > 0) {
          return {
            epics_count: issues.length,
            epics: issues.slice(0, 5).map((iss) => ({
              key: iss.key,
              summary: iss.summary || iss.fields?.summary,
              status: iss.status || iss.fields?.status?.name || 'Unknown',
              progress_pct: 0,
            })),
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
              title: pages[0].title || 'Untitled roadmap page',
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
  // Tier 2: PostgreSQL Database Snapshot Fallback
  dbCacheFallback: async (source, inputArgs) => {
    const quarter = inputArgs.quarter || 'Q4';
    const okrs = (databaseService.getOkrsByQuarter ? await databaseService.getOkrsByQuarter(quarter).catch(() => []) : await databaseService.getOkrRecords(quarter).catch(() => [])) || [];
    
    return {
      initiative_id: inputArgs.initiative_id || 'q4_roadmap',
      quarter,
      // Roadmap epics come from Jira only; there is no roadmap snapshot table to fall back to.
      epics: [],
      okr_count: okrs.length,
      drift_days: null,
      data_availability: 'no_roadmap_data',
      source: 'postgres_okr_snapshot',
      staleDataWarning: true,
      synced_at: new Date().toISOString(),
    };
  },
  // Tier 3: Deterministic Mathematical Modeling & Strategic Reporting
  computeMath: async (sourceResults, inputArgs) => {
    const jiraData = sourceResults.jira?.data;
    const defaultData = sourceResults.default?.data;
    const dbFallbackData = sourceResults.dbCacheFallback?.data;
    const mode = inputArgs.mode || 'ANALYZE';
    const quarter = inputArgs.quarter || 'Q4';

    const epics = (Array.isArray(jiraData?.epics) && jiraData.epics.length > 0)
      ? jiraData.epics
      : (Array.isArray(dbFallbackData?.epics) ? dbFallbackData.epics : []);

    if (epics.length === 0) {
      return {
        mode,
        target: inputArgs.target || 'ALL',
        quarter,
        items: [],
        epics: [],
        data_availability: 'no_roadmap_data',
        summary: `### 🗺️ Roadmap Alignment: ${quarter}\n\n> No roadmap epics are available. Connect Jira in **Admin → Settings** (epics with target dates) to analyse milestone drift and dependencies.`,
      };
    }

    if (mode === 'LIST_RAW') {
      const epicRows = epics.map((e) => {
        const epicLink = formatMarkdownLinkOrCode(`**${e.key}**`, getDirectOrFormattedJiraUrl(e));
        const statusBadge = e.status === 'BLOCKED' ? '🔴 Blocked' : e.progress_pct >= 80 ? '🟢 On Track' : '🟡 In Progress';
        return `| ${epicLink} | **${e.summary}** | **${e.progress_pct}%** | \`@${e.owner}\` | \`${e.target_date}\` | ${statusBadge} |`;
      });
      const listSummary = `### 🗺️ Quarterly Roadmap Epics: ${quarter} (${epics.length} Epics)\n\n` +
        `| Epic Key | Summary | Progress | Owner | Target Date | Status |\n| :--- | :--- | :---: | :--- | :---: | :---: |\n` +
        (epicRows.length > 0 ? epicRows.join('\n') : '| *No active epics found for quarter* | - | - | - | - | - |') +
        `\n\n> 💡 **Milestone Alignment**: Overall progress and cross-team dependencies are tracked against ${quarter} target dates.`;

      return {
        mode: 'LIST_RAW',
        target: inputArgs.target || 'ALL',
        quarter,
        initiative_id: inputArgs.initiative_id,
        items: epics,
        total_epics: epics.length,
        summary: listSummary,
      };
    }

    if (mode === 'DRILL_DOWN') {
      const activeBlockers = epics.flatMap((e) => (e.blockers || []).map((b) => ({ epic: e.key, blocker: b })));
      let drillSummary = '';
      if (inputArgs.target === 'BLOCKERS') {
        drillSummary = `### 🚫 Cross-Team Technical Blockers: ${quarter}\n\n` +
          (activeBlockers.length > 0
            ? activeBlockers.map((b) => `- **[${b.epic}]**: ${b.blocker}`).join('\n')
            : '🟢 **Zero Active Blockers**: All critical epic dependencies are clear.') +
          `\n\n> 💡 **Escalation Protocol**: Unblock high-priority cross-team dependencies in sprint planning.`;
      } else if (inputArgs.target === 'DRIFT') {
        drillSummary = `### ⏱️ Roadmap Milestone Drift & Scope Creep: ${quarter}\n\n` +
          epics.map((e) => `- **${e.key} (${e.summary})**: ${e.current_points > e.baseline_points ? `+${Math.round(((e.current_points - e.baseline_points)/e.baseline_points)*100)}% scope creep (${e.current_points} vs ${e.baseline_points} pts)` : 'On baseline scope'}`).join('\n') +
          `\n\n> 💡 **Pacing Guidance**: Re-evaluate capacity buffers for epics experiencing scope expansion.`;
      } else {
        drillSummary = `### 🎯 Targeted Epic Alignment Breakdown: ${quarter}\n\n` +
          epics.map((e) => `- **${e.key}**: ${e.summary} (${e.progress_pct}% complete, Target: \`${e.target_date}\`)\n  *Owner*: \`@${e.owner}\` | *Status*: ${e.status}`).join('\n\n') +
          `\n\n> 💡 **Quarter Goal**: Maintain alignment across engineering tracks.`;
      }

      return {
        mode: 'DRILL_DOWN',
        target: inputArgs.target || 'ALL',
        quarter,
        initiative_id: inputArgs.initiative_id,
        epics_count: epics.length,
        blockers: activeBlockers,
        summary: drillSummary,
      };
    }

    // Mathematical Scope Creep & Milestone Drift Calculations
    let totalBaselinePoints = 0;
    let totalCurrentPoints = 0;
    let totalWeightedProgress = 0;
    const blockersList = [];
    const analyzedEpics = [];

    epics.forEach((epic) => {
      const baseline = epic.baseline_points || 30;
      const current = epic.current_points || baseline;
      const progress = epic.progress_pct || 0;
      const scopeCreepPct = baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : 0;

      totalBaselinePoints += baseline;
      totalCurrentPoints += current;
      totalWeightedProgress += progress * current;

      // Classify Epic Health & Drift Days
      let health = 'ON_TRACK';
      let driftDays = 0;
      let projectedSlipDate = epic.target_date;

      if (epic.blockers && epic.blockers.length > 0) {
        health = 'BLOCKED / AT_RISK';
        blockersList.push({
          epic: epic.key,
          summary: epic.summary,
          owner: epic.owner,
          blocker_description: epic.blockers.join('; '),
        });
      } else if (scopeCreepPct > 20 || progress < 50) {
        health = 'AT_RISK';
      } else if (progress >= 75) {
        health = 'ON_TRACK';
      }
      // Slip is not projected: that needs velocity per epic, which this data does not have.
      driftDays = null;
      projectedSlipDate = null;

      analyzedEpics.push({
        ...epic,
        scope_creep_pct: scopeCreepPct,
        drift_days: driftDays,
        projected_slip_date: projectedSlipDate,
        health_status: health,
      });
    });

    const overallProgressPct = totalCurrentPoints > 0 ? Math.round(totalWeightedProgress / totalCurrentPoints) : 0;
    const totalScopeCreepPct = totalBaselinePoints > 0 ? Math.round(((totalCurrentPoints - totalBaselinePoints) / totalBaselinePoints) * 100) : 0;

    let overallHealth = 'ON_TRACK';
    if (blockersList.length > 0 || totalScopeCreepPct > 25) {
      overallHealth = 'AT_RISK';
    }
    const today = new Date().toISOString().split('T')[0];
    const overdue = analyzedEpics.filter((e) => e.target_date && e.target_date < today && (Number(e.progress_pct) || 0) < 100);
    if (overdue.length > 0) {
      overallHealth = 'DELAYED';
    }
    const topCreep = [...analyzedEpics].sort((a, b) => (b.scope_creep_pct || 0) - (a.scope_creep_pct || 0))[0];
    const actions = [];
    blockersList.forEach((b) => actions.push(`**Resolve blocker on \`${b.epic}\`** (${b.owner || 'owner unknown'}): ${b.blocker_description}`));
    overdue.forEach((e) => actions.push(`**Re-plan \`${e.key}\`**: target date ${e.target_date} has passed at ${e.progress_pct}% complete.`));
    analyzedEpics.filter((e) => (e.scope_creep_pct || 0) > 20).forEach((e) => actions.push(`**Review scope of \`${e.key}\`**: +${e.scope_creep_pct}% points since baseline.`));

    // Build Executive Markdown Report
    const markdownSummary = `
### 🎯 Executive Milestone Health & Pacing Summary
- **Target Release Horizon**: **${quarter} Initiative Roadmap** (${inputArgs.initiative_id || 'q4_roadmap'})
- **Overall Strategic Health**: **${overallHealth === 'ON_TRACK' ? '🟢 ON TRACK' : overallHealth === 'AT_RISK' ? '🟡 AT RISK' : '🔴 DELAYED'}**
- **Aggregate Progress**: **${overallProgressPct}% Complete** across ${analyzedEpics.length} strategic epics
- **Net Scope Creep**: **+${totalScopeCreepPct}%** (${totalCurrentPoints} story points vs ${totalBaselinePoints} baseline)
- **Active Critical Blockers**: **${blockersList.length} dependency bottleneck(s)**

---

### 📊 Epic Progress & Timeline Breakdown
| Epic Key | Strategic Epic Summary | Owner / Pod | Progress | Scope Creep | Target Date | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
${analyzedEpics.map((e) => `| **${e.key}** | ${e.summary} | ${e.owner || '—'} | ${e.progress_pct ?? '—'}% | +${e.scope_creep_pct}% | \`${e.target_date || 'no date'}\` | ${e.health_status.includes('ON_TRACK') ? '🟢 On Track' : e.health_status.includes('BLOCKED') ? '🔴 Blocked' : '🟡 At Risk'} |`).join('\n')}

---

### 🔗 Cross-Team Technical Dependencies & Critical Path Blockers
${blockersList.length > 0 ? blockersList.map((b) => `- ⚠️ **[${b.epic}] ${b.summary}** (${b.owner || 'owner unknown'}):\n  - **Upstream Blocker**: ${b.blocker_description}`).join('\n') : '- ✅ No blockers recorded on these epics.'}

---

### 📈 Scope Creep & Velocity Risk Audit
- **Injected Story Points**: **+${totalCurrentPoints - totalBaselinePoints} pts** added post-planning across active epics.
- **Top Scope Expansion**: ${topCreep && topCreep.scope_creep_pct > 0 ? `\`${topCreep.key}\` (+${topCreep.scope_creep_pct}% points)` : 'none recorded'}.
- **Overdue Epics**: ${overdue.length > 0 ? overdue.map((e) => `\`${e.key}\` (target ${e.target_date})`).join(', ') : 'none'}.

---

### 🛠️ Recommended De-risking & Re-alignment Actions
${actions.length > 0 ? actions.map((a, i) => `${i + 1}. ${a}`).join('\n') : '- No de-risking actions indicated by the current epic data.'}

---

### 📌 Data Provenance
- **Telemetry Sources**: ${jiraData ? '🟢 Live Jira Portfolio REST API & Notion MCP' : '🟡 Resilient PostgreSQL okr_tracker cached snapshot'}
- **Generated At**: \`${new Date().toISOString()}\`
`.trim();

    return {
      mode: 'ANALYZE',
      initiative_id: inputArgs.initiative_id || 'q4_roadmap',
      quarter,
      overall_health: overallHealth,
      overall_progress_pct: overallProgressPct,
      scope_creep_pct: totalScopeCreepPct,
      epics: analyzedEpics,
      blockers: blockersList,
      total_baseline_points: totalBaselinePoints,
      total_current_points: totalCurrentPoints,
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

import { z } from 'zod';
import { okrAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import { info, warn, error } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool } from './baseAgent.js';

export const okrProgressTool = createDeterministicToolHarness({
  name: 'evaluate_okr_progress',
  description: 'Evaluates quarterly engineering Objectives and Key Results (OKRs), confidence pacing scores, leading vs lagging indicators, and gap remediation proposals.',
  featureFlagKey: 'okr',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'notion', 'jira']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    target: z.enum(['ALL', 'AT_RISK', 'OBJECTIVES', 'GAP_REMEDIATION', 'KRS']).default('ALL'),
    quarter: z.string().default('Q4'),
    objective_id: z.string().default('all'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Live MCP & Multi-Source Executors
  mcpExecutors: {
    notion: async (_inputArgs) => {
      try {
        const configuredPageId = settingsService.getCachedSettings()?.mcp?.notion?.okrPageId || process.env.NOTION_OKR_PAGE_ID;
        const res = await safeExecuteMCPTool('notion_search', { query: configuredPageId || 'Engineering OKRs Quarterly Review' });

        if (res) {
          const pages = Array.isArray(res) ? res : (Array.isArray(res.results) ? res.results : []);
          if (pages.length > 0) {
            return {
              okr_hub_found: true,
              hub_title: pages[0].title || 'Engineering OKRs & KPI Hub',
              hub_url: pages[0].url || null,
              source: 'mcp_notion',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (err) {
        warn({ module: 'okrHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    jira: async (_inputArgs) => {
      try {
        const jql = 'issuetype in (Bug, Incident) AND status in (Closed, Resolved) AND resolved >= -90d';
        const res = await safeExecuteMCPTool('jira_search', { jql });
        if (!res) return null;
        const issues = Array.isArray(res) ? res : (Array.isArray(res?.issues) ? res.issues : []);

        return {
          total_resolved_bugs: issues.length,
          source: 'mcp_jira',
          synced_at: new Date().toISOString(),
        };
      } catch (err) {
        warn({ module: 'okrHarness', action: 'jiraExecutor', err: err.message }, 'Jira executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const quarter = inputArgs.quarter || 'Q4';
      const dbRecords = await databaseService.getOkrRecords(quarter).catch(() => []);
      
      if (dbRecords && dbRecords.length > 0) {
        return {
          quarter,
          okrs: dbRecords.map((r) => ({
            id: r.id,
            objective: r.objective,
            kr: r.key_result,
            target_value: Number(r.target_value),
            current_value: Number(r.current_value),
            status: r.status,
            quarter: r.quarter,
          })),
          synced_at: new Date().toISOString(),
        };
      }

      // No OKRs recorded: report that. (This used to seed invented OKRs into the database.)
      return {
        quarter,
        okrs: [],
        data_availability: 'no_okrs',
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 2: PostgreSQL Database Snapshot Fallback
  dbCacheFallback: async (source, inputArgs) => {
    const quarter = inputArgs.quarter || 'Q4';
    const records = await databaseService.getOkrRecords(quarter).catch(() => []);
    
    return {
      quarter,
      okrs: records.map((r) => ({
        id: r.id,
        objective: r.objective,
        kr: r.key_result,
        target_value: Number(r.target_value),
        current_value: Number(r.current_value),
        status: r.status,
        quarter: r.quarter,
      })),
      source: 'postgres_okr_tracker',
      staleDataWarning: true,
      synced_at: new Date().toISOString(),
    };
  },
  // Tier 3: Deterministic Mathematical Modeling & Strategic OKR Analytics
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data;
    const dbFallbackData = sourceResults.dbCacheFallback?.data;
    const mode = inputArgs.mode || 'ANALYZE';
    const quarter = inputArgs.quarter || 'Q4';

    const rawKrs = (Array.isArray(defaultData?.okrs) && defaultData.okrs.length > 0)
      ? defaultData.okrs
      : (Array.isArray(dbFallbackData?.okrs) ? dbFallbackData.okrs : []);

    if (rawKrs.length === 0) {
      return {
        mode,
        target: inputArgs.target || 'ALL',
        quarter,
        total_krs: 0,
        items: [],
        data_availability: 'no_okrs',
        summary: `### 🎯 OKR Progress: ${quarter}\n\n> No OKRs are recorded for ${quarter}. Add objectives and key results (target and current values) to track pacing; nothing is estimated without them.`,
      };
    }

    if (mode === 'LIST_RAW') {
      const krRows = rawKrs.map((item) => {
        const target = Number(item.target_value || item.target || 100);
        const current = Number(item.current_value || item.current || 0);
        const isInverse = item.direction === 'LOWER_IS_BETTER' || /latency|turnaround|hours|ms|seconds|bugs|incidents|flakiness/i.test(item.kr || item.key_result || '');
        const score = isInverse ? (current > 0 ? Math.min(1.0, target / current) : 1.0) : (target > 0 ? Math.min(1.0, current / target) : 1.0);
        const progressPct = Math.round(score * 100);
        const statusBadge = progressPct >= 80 ? '🟢 On Track' : progressPct >= 60 ? '🟡 At Risk' : '🔴 Off Track';
        return `| **${item.kr || item.key_result || 'Key Result'}** | \`${current} ${item.unit || ''}\` | \`${target} ${item.unit || ''}\` | **${progressPct}%** | ${statusBadge} |`;
      });

      const listSummary = `### 🎯 Engineering OKRs & Key Results: ${quarter} (${rawKrs.length} Key Results)\n\n` +
        `| Key Result Description | Current | Target | Progress | Status |\n| :--- | :---: | :---: | :---: | :---: |\n` +
        (krRows.length > 0 ? krRows.join('\n') : '| *No OKRs recorded for quarter* | - | - | - | - |') +
        `\n\n> 💡 **Pacing Guidance**: Focus engineering sprints on items flagged At Risk or Off Track.`;

      return {
        mode: 'LIST_RAW',
        target: inputArgs.target || 'ALL',
        quarter,
        total_krs: rawKrs.length,
        items: rawKrs,
        summary: listSummary,
      };
    }

    // Directional Metric Progress & Confidence Scoring
    const analyzedKrs = [];
    const laggingKrs = [];
    let totalProgressSum = 0;
    let totalConfidenceSum = 0;
    let leadingCount = 0;
    let leadingProgressSum = 0;
    let laggingCount = 0;
    let laggingProgressSum = 0;

    rawKrs.forEach((item) => {
      const target = Number(item.target_value || item.target || 100);
      const current = Number(item.current_value || item.current || 0);
      const isInverse = item.direction === 'LOWER_IS_BETTER' || /latency|turnaround|hours|ms|seconds|bugs|incidents|flakiness/i.test(item.kr || item.key_result || '');
      const isLeading = item.type === 'LEADING' || /latency|turnaround|coverage|check-ins|review|prs|commit/i.test(item.kr || item.key_result || '');

      let score = 0;
      if (isInverse) {
        score = current > 0 ? Math.min(1.0, target / current) : 1.0;
      } else {
        score = target > 0 ? Math.min(1.0, current / target) : 1.0;
      }

      const progressPct = Math.round(score * 100);
      
      // Calculate normalized confidence score (0.00 to 1.00)
      let confidenceScore = Number(Math.min(1.0, score * 1.05).toFixed(2));
      let status = 'ON_TRACK';

      if (progressPct >= 80) {
        status = 'ON_TRACK';
        confidenceScore = Math.max(0.80, confidenceScore);
      } else if (progressPct >= 60) {
        status = 'AT_RISK';
        confidenceScore = Number(Math.max(0.50, Math.min(0.79, confidenceScore)).toFixed(2));
        laggingKrs.push({
          objective: item.objective,
          kr: item.kr || item.key_result,
          current: `${current} ${item.unit || ''}`.trim(),
          target: `${target} ${item.unit || ''}`.trim(),
          progress_pct: progressPct,
          confidence_score: confidenceScore,
          root_cause: item.root_cause || 'Not recorded (needs owner input)',
          remediation: item.remediation || 'Owner to propose a recovery plan at the next OKR check-in',
        });
      } else {
        status = 'OFF_TRACK';
        confidenceScore = Number(Math.min(0.49, confidenceScore).toFixed(2));
        laggingKrs.push({
          objective: item.objective,
          kr: item.kr || item.key_result,
          current: `${current} ${item.unit || ''}`.trim(),
          target: `${target} ${item.unit || ''}`.trim(),
          progress_pct: progressPct,
          confidence_score: confidenceScore,
          root_cause: item.root_cause || 'Not recorded (needs owner input)',
          remediation: item.remediation || 'Off track: review scope or target with the objective owner',
        });
      }

      if (isLeading) {
        leadingCount++;
        leadingProgressSum += progressPct;
      } else {
        laggingCount++;
        laggingProgressSum += progressPct;
      }

      totalProgressSum += progressPct;
      totalConfidenceSum += confidenceScore;

      analyzedKrs.push({
        objective: item.objective || 'General Engineering Excellence',
        kr: item.kr || item.key_result,
        target: `${target} ${item.unit || ''}`.trim(),
        current: `${current} ${item.unit || ''}`.trim(),
        progress_pct: progressPct,
        confidence_score: confidenceScore,
        indicator_type: isLeading ? 'Leading' : 'Lagging',
        status,
      });
    });

    const totalKrsCount = Math.max(1, analyzedKrs.length);
    const overallProgressPct = Math.round(totalProgressSum / totalKrsCount);
    const overallConfidenceScore = Number((totalConfidenceSum / totalKrsCount).toFixed(2));
    const leadingAvgProgress = leadingCount > 0 ? Math.round(leadingProgressSum / leadingCount) : overallProgressPct;
    const laggingAvgProgress = laggingCount > 0 ? Math.round(laggingProgressSum / laggingCount) : overallProgressPct;

    let pacing = 'ON_TRACK';
    if (overallConfidenceScore < 0.60 || overallProgressPct < 65) {
      pacing = 'AT_RISK';
    }
    if (overallConfidenceScore < 0.40 || overallProgressPct < 45) {
      pacing = 'OFF_TRACK';
    }

    if (mode === 'DRILL_DOWN') {
      let drillSummary = '';
      if (inputArgs.target === 'AT_RISK' || inputArgs.target === 'GAP_REMEDIATION') {
        drillSummary = `### ⚠️ At-Risk Key Results & Gap Remediation: ${quarter}\n\n` +
          (laggingKrs.length > 0
            ? laggingKrs.map((k) => `#### 📌 ${k.kr}\n- **Current vs Target**: ${k.current} / ${k.target} (${k.progress_pct}% complete, Confidence: ${k.confidence_score})\n- **Root Cause**: ${k.root_cause}\n- **Remediation Plan**: ${k.remediation}`).join('\n\n')
            : '🟢 **All Key Results On Track**: Zero high-risk pacing gaps detected.') +
          `\n\n> 💡 **Executive Action**: Review remediation resource allocation with tech leads.`;
      } else {
        drillSummary = `### 🎯 Targeted OKR Progress Breakdown: ${quarter}\n\n` +
          analyzedKrs.map((k) => `- **${k.kr}**: Current: ${k.current} (Target: ${k.target}, ${k.progress_pct}% complete - ${k.status})`).join('\n') +
          `\n\n> 💡 **Status**: Track leading indicator metrics in weekly EM dashboards.`;
      }

      return {
        mode: 'DRILL_DOWN',
        target: inputArgs.target || 'ALL',
        quarter,
        overall_progress_pct: overallProgressPct,
        overall_confidence_score: overallConfidenceScore,
        at_risk_krs: laggingKrs,
        summary: drillSummary,
      };
    }

    // Build Executive Markdown Report
    const markdownSummary = `
### 🎯 Executive OKR Pacing & Strategic Scorecard
- **Quarterly Target Cycle**: **${quarter} Engineering Objectives**
- **Overall Execution Pacing**: **${pacing === 'ON_TRACK' ? '🟢 ON TRACK' : pacing === 'AT_RISK' ? '🟡 AT RISK' : '🔴 OFF TRACK'}**
- **Aggregate Quarter Completion**: **${overallProgressPct}%** across ${analyzedKrs.length} Key Results
- **Overall Confidence Score**: **${overallConfidenceScore} / 1.00**
- **Leading Indicator Health**: **${leadingAvgProgress}%** (Operational Pace) vs **Lagging Outcome**: **${laggingAvgProgress}%** (System Metrics)

---

### 📊 Objective & Key Result Detail Breakdown
| Objective | Key Result | Target | Current | Progress | Confidence | Indicator Type | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
${analyzedKrs.map((k) => `| ${k.objective.replace(/O\d+:\s*/, '')} | **${k.kr.replace(/KR\d+:\s*/, '')}** | \`${k.target}\` | \`${k.current}\` | **${k.progress_pct}%** | \`${k.confidence_score}\` | *${k.indicator_type}* | ${k.status === 'ON_TRACK' ? '🟢 On Track' : k.status === 'AT_RISK' ? '🟡 At Risk' : '🔴 Off Track'} |`).join('\n')}

---

### 🔄 Leading vs Lagging Indicator Divergence Analysis
- **Leading Indicators Average**: **${leadingAvgProgress}%** (Reflects daily review responsiveness, test velocity, and 1-on-1 rhythm).
- **Lagging Outcomes Average**: **${laggingAvgProgress}%** (Reflects production SLA uptime and incident escapement).
- **Divergence**: ${leadingAvgProgress < laggingAvgProgress ? `⚠️ Leading indicators (${leadingAvgProgress}%) trail lagging outcomes (${laggingAvgProgress}%), which usually precedes slippage on the outcome KRs.` : '✅ Leading indicators are not trailing lagging outcomes.'}

---

### ⚠️ Lagging Key Results & Root Cause Diagnosis
${laggingKrs.length > 0 ? laggingKrs.map((l) => `- 🟡 **${l.kr}** (${l.progress_pct}% Progress, Confidence: \`${l.confidence_score}\`):\n  - **Root Cause**: ${l.root_cause}\n  - **Remediation**: ${l.remediation}`).join('\n') : '- ✅ All quarterly Key Results are meeting or exceeding trajectory milestones.'}

---

### 🛠️ Actionable Gap Remediation Proposals
${laggingKrs.length > 0 ? laggingKrs.map((l, i) => `${i + 1}. **${l.kr}**: ${l.current} vs target ${l.target} (${l.progress_pct}%). ${l.remediation}.`).join('\n') : '- No key result needs remediation.'}

---

### 📌 Data Provenance
- **Telemetry Sources**: PostgreSQL okr_tracker (recorded OKRs)
- **Generated At**: \`${new Date().toISOString()}\`
`.trim();

    return {
      mode: 'ANALYZE',
      quarter,
      objective_id: inputArgs.objective_id || 'all',
      pacing,
      overall_completion_pct: overallProgressPct,
      overall_confidence_score: overallConfidenceScore,
      leading_avg_progress: leadingAvgProgress,
      lagging_avg_progress: laggingAvgProgress,
      key_results: analyzedKrs,
      lagging_key_results: laggingKrs,
      summary: markdownSummary,
    };
  },
});

export function createOkrAgent(customTools = null, options = {}) {
  return createMicroAgent({
    name: options.name || 'okr_agent',
    defaultTool: okrProgressTool,
    promptTemplate: okrAgentPromptTemplate,
    customTools,
    options,
  });
}

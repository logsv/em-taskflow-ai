import { z } from 'zod';
import { okrAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import { warn } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool, createProvenanceNotice } from './baseAgent.js';

const OKR_SOURCE_NAME = 'PostgreSQL okr_tracker';

/**
 * Maps okr_tracker rows to the KR shape used by computeMath.
 * Only fields that actually exist on the record are carried over.
 */
function mapOkrRows(rows) {
  return (rows || []).map((r) => ({
    id: r.id,
    objective: r.objective,
    kr: r.key_result,
    target_value: r.target_value === null || r.target_value === undefined ? null : Number(r.target_value),
    current_value: r.current_value === null || r.current_value === undefined ? null : Number(r.current_value),
    unit: r.unit || '',
    status: r.status,
    quarter: r.quarter,
  }));
}

function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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
              hub_title: pages[0].title || null,
              hub_url: pages[0].url || (configuredPageId ? `https://notion.so/${configuredPageId}` : null),
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
        if (!res || typeof res !== 'object' || res.error) {
          // Jira unreachable / not configured / errored: let the harness fall through to Tier 3
          // instead of reporting a fabricated or misleading zero count as live data.
          return null;
        }
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
      const okrs = mapOkrRows(dbRecords);

      return {
        quarter,
        okrs,
        status: okrs.length > 0 ? 'OK' : 'NO_DATA',
        source: 'postgres_okr_tracker',
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 2: PostgreSQL Database Snapshot Fallback
  dbCacheFallback: async (source, inputArgs) => {
    const quarter = inputArgs.quarter || 'Q4';
    const records = await databaseService.getOkrRecords(quarter).catch(() => []);
    const okrs = mapOkrRows(records);

    return {
      quarter,
      okrs,
      status: okrs.length > 0 ? 'OK' : 'NO_DATA',
      source: 'postgres_okr_tracker',
      is_cached: true,
      staleDataWarning: true,
      synced_at: new Date().toISOString(),
    };
  },
  // Tier 3: Deterministic Mathematical Modeling & Strategic OKR Analytics
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data;
    const dbFallbackData = sourceResults.dbCacheFallback?.data;
    const notionData = sourceResults.notion?.data;
    const jiraData = sourceResults.jira?.data;
    const mode = inputArgs.mode || 'ANALYZE';
    const quarter = inputArgs.quarter || 'Q4';
    const target = inputArgs.target || 'ALL';

    const primary = (Array.isArray(defaultData?.okrs) && defaultData.okrs.length > 0)
      ? defaultData
      : (Array.isArray(dbFallbackData?.okrs) && dbFallbackData.okrs.length > 0 ? dbFallbackData : (defaultData || dbFallbackData || null));
    const rawKrs = Array.isArray(primary?.okrs) ? primary.okrs : [];
    const isCached = Boolean(primary?.is_cached) || sourceResults.default?.tierUsed === 'TIER_3_DB_CACHE';
    const syncedAt = primary?.synced_at || new Date().toISOString();
    const provenanceNotice = createProvenanceNotice(isCached, syncedAt, OKR_SOURCE_NAME);

    const auxiliarySources = [];
    if (notionData?.source === 'mcp_notion' && notionData.okr_hub_found) {
      auxiliarySources.push(`Notion OKR hub${notionData.hub_title ? `: ${notionData.hub_title}` : ''}`);
    }
    if (jiraData?.source === 'mcp_jira' && typeof jiraData.total_resolved_bugs === 'number') {
      auxiliarySources.push(`Jira (${jiraData.total_resolved_bugs} bugs/incidents resolved in last 90d)`);
    }

    // Honest empty state: no OKR records exist for this quarter.
    if (rawKrs.length === 0) {
      const emptySummary = `### 🎯 Engineering OKRs: ${quarter}\n\n` +
        `No OKR records were found for **${quarter}** in the OKR tracker. ` +
        `No progress, confidence, or pacing scores can be computed until key results are recorded.\n\n` +
        `${provenanceNotice}`;

      return {
        mode,
        target,
        quarter,
        objective_id: inputArgs.objective_id || 'all',
        status: 'NO_DATA',
        okrs: [],
        items: [],
        total_krs: 0,
        key_results: [],
        lagging_key_results: [],
        at_risk_krs: [],
        pacing: 'NO_DATA',
        overall_completion_pct: null,
        overall_progress_pct: null,
        overall_confidence_score: null,
        leading_avg_progress: null,
        lagging_avg_progress: null,
        provenance: { source: OKR_SOURCE_NAME, is_cached: isCached, synced_at: syncedAt },
        summary: emptySummary,
      };
    }

    // Per-KR scoring. KRs without a numeric target/current are listed but not scored.
    const scoreKr = (item) => {
      const krText = item.kr || item.key_result || '';
      const targetValue = toFiniteOrNull(item.target_value ?? item.target);
      const currentValue = toFiniteOrNull(item.current_value ?? item.current);
      const isInverse = item.direction === 'LOWER_IS_BETTER' || /latency|turnaround|hours|ms|seconds|bugs|incidents|flakiness/i.test(krText);
      const isLeading = item.type === 'LEADING' || /latency|turnaround|coverage|check-ins|review|prs|commit/i.test(krText);
      if (targetValue === null || currentValue === null) {
        return { krText, targetValue, currentValue, isInverse, isLeading, score: null, progressPct: null };
      }
      let score;
      if (isInverse) {
        score = currentValue > 0 ? Math.min(1.0, targetValue / currentValue) : 1.0;
      } else {
        score = targetValue > 0 ? Math.min(1.0, currentValue / targetValue) : 1.0;
      }
      return { krText, targetValue, currentValue, isInverse, isLeading, score, progressPct: Math.round(score * 100) };
    };

    const fmt = (value, unit) => (value === null ? 'n/a' : `${value} ${unit || ''}`.trim());

    if (mode === 'LIST_RAW') {
      const krRows = rawKrs.map((item) => {
        const s = scoreKr(item);
        const statusBadge = s.progressPct === null
          ? '⚪ Unscored'
          : s.progressPct >= 80 ? '🟢 On Track' : s.progressPct >= 60 ? '🟡 At Risk' : '🔴 Off Track';
        return `| **${s.krText || 'Key Result'}** | \`${fmt(s.currentValue, item.unit)}\` | \`${fmt(s.targetValue, item.unit)}\` | **${s.progressPct === null ? 'n/a' : `${s.progressPct}%`}** | ${statusBadge} |`;
      });

      const listSummary = `### 🎯 Engineering OKRs & Key Results: ${quarter} (${rawKrs.length} Key Results)\n\n` +
        `| Key Result Description | Current | Target | Progress | Status |\n| :--- | :---: | :---: | :---: | :---: |\n` +
        krRows.join('\n') +
        `\n\n${provenanceNotice}`;

      return {
        mode: 'LIST_RAW',
        target,
        quarter,
        status: 'OK',
        total_krs: rawKrs.length,
        items: rawKrs,
        provenance: { source: OKR_SOURCE_NAME, is_cached: isCached, synced_at: syncedAt },
        summary: listSummary,
      };
    }

    // Directional Metric Progress & Confidence Scoring
    const analyzedKrs = [];
    const laggingKrs = [];
    let scoredCount = 0;
    let totalProgressSum = 0;
    let totalConfidenceSum = 0;
    let leadingCount = 0;
    let leadingProgressSum = 0;
    let laggingCount = 0;
    let laggingProgressSum = 0;

    rawKrs.forEach((item) => {
      const s = scoreKr(item);
      const unit = item.unit || '';
      const current = fmt(s.currentValue, unit);
      const targetStr = fmt(s.targetValue, unit);

      if (s.score === null) {
        analyzedKrs.push({
          objective: item.objective || null,
          kr: s.krText,
          target: targetStr,
          current,
          progress_pct: null,
          confidence_score: null,
          indicator_type: s.isLeading ? 'Leading' : 'Lagging',
          status: 'UNSCORED',
        });
        return;
      }

      const progressPct = s.progressPct;
      let confidenceScore = Number(Math.min(1.0, s.score * 1.05).toFixed(2));
      let status = 'ON_TRACK';
      const gap = Number(Math.abs(s.targetValue - s.currentValue).toFixed(2));
      const gapRemediation = `Close the remaining gap of ${`${gap} ${unit}`.trim()} (${s.isInverse ? 'reduce' : 'raise'} ${current} → ${targetStr}) and assign an accountable owner.`;

      if (progressPct >= 80) {
        status = 'ON_TRACK';
        confidenceScore = Math.max(0.80, confidenceScore);
      } else if (progressPct >= 60) {
        status = 'AT_RISK';
        confidenceScore = Number(Math.max(0.50, Math.min(0.79, confidenceScore)).toFixed(2));
      } else {
        status = 'OFF_TRACK';
        confidenceScore = Number(Math.min(0.49, confidenceScore).toFixed(2));
      }

      if (status !== 'ON_TRACK') {
        laggingKrs.push({
          objective: item.objective || null,
          kr: s.krText,
          current,
          target: targetStr,
          progress_pct: progressPct,
          confidence_score: confidenceScore,
          status,
          root_cause: null,
          remediation: status === 'OFF_TRACK'
            ? `${gapRemediation} Escalate and re-scope if the gap cannot be closed this quarter.`
            : gapRemediation,
        });
      }

      if (s.isLeading) {
        leadingCount++;
        leadingProgressSum += progressPct;
      } else {
        laggingCount++;
        laggingProgressSum += progressPct;
      }

      scoredCount++;
      totalProgressSum += progressPct;
      totalConfidenceSum += confidenceScore;

      analyzedKrs.push({
        objective: item.objective || null,
        kr: s.krText,
        target: targetStr,
        current,
        progress_pct: progressPct,
        confidence_score: confidenceScore,
        indicator_type: s.isLeading ? 'Leading' : 'Lagging',
        status,
      });
    });

    const overallProgressPct = scoredCount > 0 ? Math.round(totalProgressSum / scoredCount) : null;
    const overallConfidenceScore = scoredCount > 0 ? Number((totalConfidenceSum / scoredCount).toFixed(2)) : null;
    const leadingAvgProgress = leadingCount > 0 ? Math.round(leadingProgressSum / leadingCount) : null;
    const laggingAvgProgress = laggingCount > 0 ? Math.round(laggingProgressSum / laggingCount) : null;

    let pacing = 'NO_DATA';
    if (scoredCount > 0) {
      pacing = 'ON_TRACK';
      if (overallConfidenceScore < 0.60 || overallProgressPct < 65) pacing = 'AT_RISK';
      if (overallConfidenceScore < 0.40 || overallProgressPct < 45) pacing = 'OFF_TRACK';
    }
    const pctStr = (v) => (v === null ? 'n/a' : `${v}%`);

    if (mode === 'DRILL_DOWN') {
      let drillSummary = '';
      if (target === 'AT_RISK' || target === 'GAP_REMEDIATION') {
        drillSummary = `### ⚠️ At-Risk Key Results & Gap Remediation: ${quarter}\n\n` +
          (laggingKrs.length > 0
            ? laggingKrs.map((k) => `#### 📌 ${k.kr}\n- **Current vs Target**: ${k.current} / ${k.target} (${k.progress_pct}% complete, Confidence: ${k.confidence_score})\n- **Remediation Plan**: ${k.remediation}`).join('\n\n')
            : (scoredCount > 0 ? '🟢 **All scored Key Results On Track**: No pacing gaps detected.' : '⚪ No Key Results have numeric targets to score.')) +
          `\n\n${provenanceNotice}`;
      } else {
        drillSummary = `### 🎯 Targeted OKR Progress Breakdown: ${quarter}\n\n` +
          analyzedKrs.map((k) => `- **${k.kr}**: Current: ${k.current} (Target: ${k.target}, ${pctStr(k.progress_pct)} complete - ${k.status})`).join('\n') +
          `\n\n${provenanceNotice}`;
      }

      return {
        mode: 'DRILL_DOWN',
        target,
        quarter,
        status: 'OK',
        overall_progress_pct: overallProgressPct,
        overall_confidence_score: overallConfidenceScore,
        at_risk_krs: laggingKrs,
        provenance: { source: OKR_SOURCE_NAME, is_cached: isCached, synced_at: syncedAt },
        summary: drillSummary,
      };
    }

    const pacingLabel = { ON_TRACK: '🟢 ON TRACK', AT_RISK: '🟡 AT RISK', OFF_TRACK: '🔴 OFF TRACK', NO_DATA: '⚪ NO DATA' }[pacing];
    const statusLabel = (st) => ({ ON_TRACK: '🟢 On Track', AT_RISK: '🟡 At Risk', OFF_TRACK: '🔴 Off Track', UNSCORED: '⚪ Unscored' }[st]);

    let divergenceLine;
    if (leadingAvgProgress === null || laggingAvgProgress === null) {
      divergenceLine = 'ℹ️ Divergence cannot be assessed: both leading and lagging Key Results are required.';
    } else if (leadingAvgProgress < laggingAvgProgress) {
      divergenceLine = `⚠️ **Leading indicators (${leadingAvgProgress}%) trail lagging outcomes (${laggingAvgProgress}%)**: future outcome metrics are likely to slip if leading behaviors do not recover.`;
    } else {
      divergenceLine = '✅ Leading indicators are in alignment with lagging outcome goals.';
    }

    const remediationProposals = laggingKrs.length > 0
      ? laggingKrs
        .slice()
        .sort((a, b) => a.progress_pct - b.progress_pct)
        .map((k, idx) => `${idx + 1}. **${k.kr}** (P${Math.min(idx, 2)}): ${k.remediation}`)
        .join('\n')
      : '- No remediation required: no scored Key Results are At Risk or Off Track.';

    // Build Executive Markdown Report
    const markdownSummary = `
### 🎯 Executive OKR Pacing & Strategic Scorecard
- **Quarterly Target Cycle**: **${quarter} Engineering Objectives**
- **Overall Execution Pacing**: **${pacingLabel}**
- **Aggregate Quarter Completion**: **${pctStr(overallProgressPct)}** across ${scoredCount} scored of ${analyzedKrs.length} Key Results
- **Overall Confidence Score**: **${overallConfidenceScore === null ? 'n/a' : overallConfidenceScore} / 1.00**
- **Leading Indicator Health**: **${pctStr(leadingAvgProgress)}** vs **Lagging Outcome**: **${pctStr(laggingAvgProgress)}**

---

### 📊 Objective & Key Result Detail Breakdown
| Objective | Key Result | Target | Current | Progress | Confidence | Indicator Type | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
${analyzedKrs.map((k) => `| ${(k.objective || '—').replace(/O\d+:\s*/, '')} | **${(k.kr || '').replace(/KR\d+:\s*/, '')}** | \`${k.target}\` | \`${k.current}\` | **${pctStr(k.progress_pct)}** | \`${k.confidence_score === null ? 'n/a' : k.confidence_score}\` | *${k.indicator_type}* | ${statusLabel(k.status)} |`).join('\n')}

---

### 🔄 Leading vs Lagging Indicator Divergence Analysis
- **Leading Indicators Average**: **${pctStr(leadingAvgProgress)}** (${leadingCount} Key Results)
- **Lagging Outcomes Average**: **${pctStr(laggingAvgProgress)}** (${laggingCount} Key Results)
- **Divergence Warning**: ${divergenceLine}

---

### ⚠️ Lagging Key Results
${laggingKrs.length > 0 ? laggingKrs.map((l) => `- ${l.status === 'OFF_TRACK' ? '🔴' : '🟡'} **${l.kr}** (${l.progress_pct}% Progress, Confidence: \`${l.confidence_score}\`): ${l.current} vs target ${l.target}`).join('\n') : '- ✅ All scored Key Results are meeting or exceeding trajectory milestones.'}

---

### 🛠️ Actionable Gap Remediation Proposals
${remediationProposals}

---

### 📌 Data Provenance
${provenanceNotice}
- **Supplementary Sources**: ${auxiliarySources.length > 0 ? auxiliarySources.join('; ') : 'None available'}
`.trim();

    return {
      mode: 'ANALYZE',
      quarter,
      objective_id: inputArgs.objective_id || 'all',
      status: 'OK',
      pacing,
      overall_completion_pct: overallProgressPct,
      overall_confidence_score: overallConfidenceScore,
      leading_avg_progress: leadingAvgProgress,
      lagging_avg_progress: laggingAvgProgress,
      key_results: analyzedKrs,
      lagging_key_results: laggingKrs,
      provenance: { source: OKR_SOURCE_NAME, is_cached: isCached, synced_at: syncedAt },
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

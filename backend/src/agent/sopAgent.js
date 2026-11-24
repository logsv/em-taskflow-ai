import { z } from 'zod';
import { sopAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';
import settingsService from '../services/settingsService.js';
import { info, warn, error } from '../utils/logger.js';
import { createMicroAgent, safeExecuteMCPTool } from './baseAgent.js';
import { swallow, recordHandledError } from '../core/safe.js';

export const sopComplianceTool = createDeterministicToolHarness({
  name: 'query_sop_compliance',
  description: 'Validates architectural proposals, PR code reviews, security standards, and release workflows against internal Standard Operating Procedures (SOPs) and Architecture Decision Records (ADRs).',
  featureFlagKey: 'sop',
  schema: z.object({
    sources: z.array(z.string()).default(['default', 'rag', 'notion']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'DRILL_DOWN', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    target: z.enum(['ALL', 'ADRS', 'SOPS', 'VIOLATIONS', 'POLICIES']).default('ALL'),
    topic: z.string().default('general').describe('Governance topic (e.g. security, database_isolation, code_review, release, telemetry)'),
    query: z.string().optional().describe('Specific compliance or architectural question'),
    task_context: z.string().optional().describe('Context of the PR, architectural change, or task under audit'),
    fetch_fresh_data: z.boolean().default(true),
  }),
  // Tier 1: Live MCP & RAG Hybrid Retrieval Executors
  mcpExecutors: {
    rag: async (inputArgs) => {
      const q = inputArgs.query || inputArgs.topic || inputArgs.task_context || 'engineering standard operating procedures';
      try {
        const { baselineRetrieve } = await import('../rag/retriever.js');
        const ragRes = await Promise.race([
          baselineRetrieve(q, { topK: 3 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RAG retrieval timed out')), 2500)),
        ]).catch(swallow('agent.sopAgent.rag', null));

        if (ragRes && ragRes.sources && ragRes.sources.length > 0) {
          return {
            rag_hit: true,
            retrieved_chunks_count: ragRes.sources.length,
            top_sources: ragRes.sources.map((s) => ({
              title: s.metadata?.title || s.metadata?.document_name || s.metadata?.filename || 'Uploaded document',
              citation: `[Doc: ${s.metadata?.filename || s.metadata?.title || 'uploaded document'}${Number.isFinite(s.metadata?.chunkIndex) ? `, chunk ${s.metadata.chunkIndex}` : ''}]`,
              content_snippet: (s.pageContent || s.text || '').slice(0, 200),
            })),
            source: 'mcp_rag_hybrid',
            synced_at: new Date().toISOString(),
          };
        }
      } catch (err) {
        warn({ module: 'sopHarness', action: 'ragExecutor', err: err.message }, 'RAG executor notice');
      }
      return null;
    },
    notion: async (_inputArgs) => {
      try {
        const configuredPageId = settingsService.getCachedSettings()?.mcp?.notion?.sopPageId || process.env.NOTION_SOP_PAGE_ID;
        const res = await safeExecuteMCPTool('notion_search', { query: configuredPageId || 'Engineering Handbook SOP ADR Governance' });

        if (res) {
          const pages = Array.isArray(res) ? res : (Array.isArray(res.results) ? res.results : []);
          if (pages.length > 0) {
            return {
              policy_hub_found: true,
              title: pages[0].title || 'Engineering Architecture & Governance Standards',
              url: pages[0].url || (configuredPageId ? `https://notion.so/${configuredPageId}` : 'https://notion.so/engineering-governance'),
              source: 'mcp_notion',
              synced_at: new Date().toISOString(),
            };
          }
        }
      } catch (err) {
        warn({ module: 'sopHarness', action: 'notionExecutor', err: err.message }, 'Notion executor notice');
      }
      return null;
    },
    default: async (inputArgs) => {
      const topic = (inputArgs.topic || inputArgs.query || 'general').toLowerCase();
      
      const internalStandards = [
        {
          id: 'BASELINE-DB-ISOLATION',
          title: 'Database Per-Service Isolation Architecture',
          category: 'database_isolation',
          rules: [
            'Each microservice MUST own an isolated PostgreSQL database (taskflow_backend, taskflow_ai, temporal, langfuse_db).',
            'Cross-service database joins, direct table queries, or cross-database foreign keys are STRICTLY PROHIBITED.',
            'Data synchronization between domains MUST occur via gRPC APIs, Temporal durable workflows, or event buses.',
          ],
          citation: '[Built-in baseline BASELINE-DB-ISOLATION (EM TaskFlow default guidance, not a company document)]',
        },
        {
          id: 'BASELINE-CODE-REVIEW',
          title: 'Code Review & Pull Request Governance Checklist',
          category: 'code_review',
          rules: [
            'Mandatory minimum of 2 peer approvals prior to merging to main.',
            'PR diff size should not exceed 300 lines of modified code (excluding auto-generated code and tests).',
            'Code review turnaround SLA is <12 hours for blockers and <24 hours for standard feature PRs.',
            'All CI automated checks (unit tests, linter, SAST) must pass with 0 errors.',
          ],
          citation: '[Built-in baseline BASELINE-CODE-REVIEW (EM TaskFlow default guidance, not a company document)]',
        },
        {
          id: 'BASELINE-SECURITY',
          title: 'Production Security Incident Escalation & Secrets Policy',
          category: 'security',
          rules: [
            'Immediate P1 escalation required for security incidents with notification to on-call lead within 15 minutes.',
            'Zero plaintext API keys, passwords, or tokens in source code, configuration files, or logs.',
            'All secrets in user-facing APIs and admin UIs MUST be masked with SHA-256 or prefix/suffix masking.',
          ],
          citation: '[Built-in baseline BASELINE-SECURITY (EM TaskFlow default guidance, not a company document)]',
        },
        {
          id: 'BASELINE-OBSERVABILITY',
          title: 'Zero-Downtime Observability & Non-Blocking Tracing',
          category: 'telemetry',
          rules: [
            'Telemetry, tracing (Langfuse/LangSmith), and observability callbacks MUST be non-blocking.',
            'An error in telemetry or trace logging must NEVER fail an API request or crash a server endpoint.',
            'Telemetry metrics must be written to isolated analytics databases on dedicated ports.',
          ],
          citation: '[Built-in baseline BASELINE-OBSERVABILITY (EM TaskFlow default guidance, not a company document)]',
        },
        {
          id: 'BASELINE-RELEASE',
          title: 'Production Release Workflow & Rollback Readiness',
          category: 'release',
          rules: [
            'All changes must be validated in staging environment with end-to-end integration tests.',
            'Every deployment must include a documented, verified rollback procedure and health check probe.',
            'Deployments during peak business hours require explicit approval from the Engineering Manager.',
          ],
          citation: '[Built-in baseline BASELINE-RELEASE (EM TaskFlow default guidance, not a company document)]',
        },
      ];

      return {
        topic: inputArgs.topic || 'general',
        standards_count: internalStandards.length,
        standards: internalStandards,
        synced_at: new Date().toISOString(),
      };
    },
  },
  // Tier 2: PostgreSQL Database Snapshot Fallback
  dbCacheFallback: async (source, inputArgs) => {
    return {
      topic: inputArgs.topic || 'general',
      standards: [
        {
          id: 'BASELINE-DB-ISOLATION',
          title: 'Database Per-Service Isolation Architecture',
          rules: ['Dedicated isolated database per service. Cross-service joins prohibited.'],
          citation: '[Built-in baseline BASELINE-DB-ISOLATION (EM TaskFlow default guidance, not a company document)]',
        },
        {
          id: 'BASELINE-CODE-REVIEW',
          title: 'Code Review Guidelines',
          rules: ['Minimum 2 peer approvals, PR size <300 lines, CI green.'],
          citation: '[Built-in baseline BASELINE-CODE-REVIEW (EM TaskFlow default guidance, not a company document)]',
        },
      ],
      source: 'builtin_baseline',
      is_builtin_baseline: true,
      synced_at: new Date().toISOString(),
    };
  },
  // Tier 3: Compliance Rubric Verification & Deterministic Governance Engine
  computeMath: async (sourceResults, inputArgs) => {
    const defaultData = sourceResults.default?.data;
    const ragData = sourceResults.rag?.data;
    const dbFallbackData = sourceResults.dbCacheFallback?.data;
    const mode = inputArgs.mode || 'ANALYZE';
    const topic = (inputArgs.topic || inputArgs.query || 'general').toLowerCase();
    const taskContext = (inputArgs.task_context || '').toLowerCase();

    const standards = defaultData?.standards || dbFallbackData?.standards || [];

    if (mode === 'LIST_RAW') {
      const standardRows = standards.map((s) => {
        return `| **${s.id}** | **${s.title}** | \`${s.category}\` | *${(s.rules?.[0] || '').slice(0, 50)}...* | 🟢 Active |`;
      });
      const listSummary = `### 📜 Standard Operating Procedures (SOPs) & ADR Governance (${standards.length} Standards)\n\n` +
        `| ID | Title | Category | Primary Rule | Status |\n| :--- | :--- | :--- | :--- | :---: |\n` +
        (standardRows.length > 0 ? standardRows.join('\n') : '| *No standards cataloged* | - | - | - | - |') +
        `\n\n> 💡 **Compliance Baseline**: All PRs and architectural RFCs must adhere to active SOPs.`;

      return {
        mode: 'LIST_RAW',
        target: inputArgs.target || 'ALL',
        topic,
        total_standards: standards.length,
        items: standards,
        summary: listSummary,
      };
    }

    // Filter relevant standards for the given topic / query
    let matchedStandards = standards.filter((s) => {
      if (topic === 'general' || topic === 'all') return true;
      if (topic.includes('security') && s.category === 'security') return true;
      if ((topic.includes('database') || topic.includes('db') || topic.includes('isolation') || topic.includes('adr')) && s.category === 'database_isolation') return true;
      if ((topic.includes('review') || topic.includes('pr') || topic.includes('code')) && s.category === 'code_review') return true;
      if ((topic.includes('telemetry') || topic.includes('trace') || topic.includes('observability')) && s.category === 'telemetry') return true;
      if ((topic.includes('release') || topic.includes('deploy') || topic.includes('rollback')) && s.category === 'release') return true;
      return s.title.toLowerCase().includes(topic) || s.category.includes(topic);
    });

    if (matchedStandards.length === 0) {
      matchedStandards = standards.slice(0, 3);
    }

    // Evaluate Compliance Rubric
    const rubricChecks = [];
    let violationsCount = 0;
    let advisoryCount = 0;

    // Rubric checks run against the text the user supplied (task_context). Without text there is
    // nothing to verify, so checks are NOT_EVALUATED; absence of a detected violation is reported as
    // NO_VIOLATION_FOUND, never as proof of compliance.
    const hasContext = taskContext.trim().length > 0;
    const evaluate = (violation, advisory = false) => {
      if (!hasContext) return 'NOT_EVALUATED';
      if (violation) return advisory ? 'NEEDS_REVIEW' : 'NON_COMPLIANT';
      return 'NO_VIOLATION_FOUND';
    };
    const baselineCitation = (id) => `[Built-in baseline ${id} (EM TaskFlow default guidance, not a company document)]`;

    if (topic.includes('review') || topic.includes('pr') || topic === 'general') {
      const singleApproval = /\b(1|one|single) approval\b/.test(taskContext);
      const status = evaluate(singleApproval, true);
      rubricChecks.push({
        dimension: 'Code Review & PR Governance (BASELINE-CODE-REVIEW)',
        requirement: '>=2 peer approvals; PR diff <300 lines; review SLA <12h',
        observed: !hasContext ? 'No evidence provided' : singleApproval ? 'Single approval mentioned' : 'No single-approval case found in the provided text',
        status,
        citation: baselineCitation('BASELINE-CODE-REVIEW'),
      });
      if (status === 'NEEDS_REVIEW') advisoryCount++;
    }

    if (topic.includes('database') || topic.includes('db') || topic.includes('isolation') || topic.includes('adr') || topic === 'general') {
      const crossDbViolation = /cross-service join|direct table access/.test(taskContext);
      const status = evaluate(crossDbViolation);
      rubricChecks.push({
        dimension: 'Database Per-Service Isolation (BASELINE-DB-ISOLATION)',
        requirement: 'One database per service; no cross-service joins',
        observed: !hasContext ? 'No evidence provided' : crossDbViolation ? 'Cross-service join or direct table access mentioned' : 'No cross-service access found in the provided text',
        status,
        citation: baselineCitation('BASELINE-DB-ISOLATION'),
      });
      if (status === 'NON_COMPLIANT') violationsCount++;
    }

    if (topic.includes('security') || topic.includes('incident') || topic === 'general') {
      const hasSecretLeak = /plaintext secret|unmasked token|hard-?coded (key|secret|token|password)/.test(taskContext);
      const status = evaluate(hasSecretLeak);
      rubricChecks.push({
        dimension: 'Security Incident Escalation & Secrets (BASELINE-SECURITY)',
        requirement: 'P1 escalation within 15 min; no plaintext secrets; token masking',
        observed: !hasContext ? 'No evidence provided' : hasSecretLeak ? 'Plaintext or unmasked secret mentioned' : 'No secret exposure found in the provided text',
        status,
        citation: baselineCitation('BASELINE-SECURITY'),
      });
      if (status === 'NON_COMPLIANT') violationsCount++;
    }

    if (topic.includes('telemetry') || topic.includes('trace') || topic.includes('observability') || topic === 'general') {
      const blocking = /blocking (trace|telemetry)|await(ed)? (langfuse|trace)|telemetry (failure|error) (fails|crash)/.test(taskContext);
      const status = evaluate(blocking);
      rubricChecks.push({
        dimension: 'Non-Blocking Telemetry (BASELINE-OBSERVABILITY)',
        requirement: 'Telemetry must be non-blocking; trace errors must never fail requests',
        observed: !hasContext ? 'No evidence provided' : blocking ? 'Blocking telemetry pattern mentioned' : 'No blocking telemetry found in the provided text',
        status,
        citation: baselineCitation('BASELINE-OBSERVABILITY'),
      });
      if (status === 'NON_COMPLIANT') violationsCount++;
    }

    let overallCompliance = hasContext ? 'NO_VIOLATIONS_FOUND' : 'NOT_EVALUATED';
    if (violationsCount > 0) {
      overallCompliance = 'NON_COMPLIANT';
    } else if (advisoryCount > 0) {
      overallCompliance = 'NEEDS_REVIEW';
    }

    if (mode === 'DRILL_DOWN') {
      let drillSummary = '';
      if (inputArgs.target === 'VIOLATIONS') {
        const failingChecks = rubricChecks.filter((c) => c.status === 'NON_COMPLIANT' || c.status === 'NEEDS_REVIEW');
        drillSummary = `### 🚨 SOP / ADR Non-Compliance Violations\n\n` +
          (failingChecks.length > 0
            ? failingChecks.map((c) => `#### ⚠️ ${c.dimension}\n- **Requirement**: ${c.requirement}\n- **Observed**: ${c.observed}\n- **Citation**: ${c.citation}`).join('\n\n')
            : '🟢 **Zero Compliance Violations**: All audited items meet active engineering governance policies.') +
          `\n\n> 💡 **Remediation**: Resolve violations prior to merge or architecture review approval.`;
      } else {
        drillSummary = `### 🔍 Targeted Governance & Policy Analysis: ${topic}\n\n` +
          matchedStandards.map((s) => `#### 📌 ${s.id}: ${s.title}\n` + (s.rules || []).map((r) => `- ${r}`).join('\n') + `\n*Citation*: ${s.citation}`).join('\n\n') +
          `\n\n> 💡 **Audited Context**: ${taskContext || 'Standard baseline evaluation'}`;
      }

      return {
        mode: 'DRILL_DOWN',
        target: inputArgs.target || 'ALL',
        topic,
        rubric_checks: rubricChecks,
        violations_count: violationsCount,
        summary: drillSummary,
      };
    }

    // Build Single-Pass Markdown Summary
    const citationsList = Array.from(new Set([
      ...matchedStandards.map((s) => s.citation),
      ...rubricChecks.map((r) => r.citation),
    ])).filter(Boolean);

    const markdownSummary = `
### 📄 Executive Summary
- **Governance Audit Scope**: **${topic.toUpperCase()} Governance Standards** (${matchedStandards.map((s) => s.id).join(', ')})
- **Compliance Verdict**: **${{ NO_VIOLATIONS_FOUND: '🟢 NO VIOLATIONS FOUND', NOT_EVALUATED: '⚪ NOT EVALUATED', NEEDS_REVIEW: '🟡 NEEDS REVIEW', NON_COMPLIANT: '🔴 NON-COMPLIANT' }[overallCompliance] || overallCompliance}**
- **Standards Source**: ${ragData?.rag_hit ? `your uploaded documents (${ragData.retrieved_chunks_count} passage(s)) plus built-in baseline guidance` : 'built-in baseline guidance only. No SOP documents were found in your knowledge base; upload your SOPs/ADRs to check against them'}
- **Summary**: ${overallCompliance === 'NOT_EVALUATED' ? 'No change description or evidence was provided, so nothing was checked. Paste the PR, design or process description to evaluate it.' : `${violationsCount} violation(s) and ${advisoryCount} item(s) needing review in the provided text.`}

---

### 🔍 Key Document Analysis & Rubric Guidelines
${matchedStandards.map((s) => `#### 📘 ${s.id}: ${s.title}\n${s.rules.map((r) => `- ${r}`).join('\n')}`).join('\n\n')}

---

### 🛡️ Compliance Gap & Remediation Audit
| Governance Dimension | Mandatory Requirement | Observed Implementation | Status |
| :--- | :--- | :--- | :---: |
${rubricChecks.map((r) => `| **${r.dimension}** | ${r.requirement} | ${r.observed} | ${{ NO_VIOLATION_FOUND: '🟢 No violation found', NOT_EVALUATED: '⚪ Not evaluated', NEEDS_REVIEW: '🟡 Needs review', NON_COMPLIANT: '🔴 Non-compliant' }[r.status] || r.status} |`).join('\n')}
${ragData?.rag_hit ? `\n**From your documents**:\n${(ragData.top_sources || []).map((d) => `- ${d.citation}: ${d.content_snippet}`).join('\n')}` : ''}

---

### 📌 Source Citations
${citationsList.map((c) => `- ${c}`).join('\n')}
`.trim();

    return {
      mode: 'ANALYZE',
      topic,
      overall_compliance: overallCompliance,
      checked_sops: matchedStandards.map((s) => `${s.id}: ${s.title}`),
      rubric_checks: rubricChecks,
      citations: citationsList,
      summary: markdownSummary,
    };
  },
});

export function createSopAgent(customTools = null, options = {}) {
  return createMicroAgent({
    name: 'sop_agent',
    defaultTool: sopComplianceTool,
    promptTemplate: sopAgentPromptTemplate,
    customTools,
    options,
  });
}

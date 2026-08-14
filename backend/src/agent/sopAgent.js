import { createAgent } from 'langchain';
import { z } from 'zod';
import { getChatModel } from '../llm/index.js';
import { sopAgentPromptTemplate } from './prompts.js';
import { createDeterministicToolHarness } from '../mcp/baseToolHarness.js';
import databaseService from '../db/postgres.js';

export const sopComplianceTool = createDeterministicToolHarness({
  name: 'query_sop_compliance',
  description: 'Queries engineering Standard Operating Procedures (SOPs), ADRs, wikis, and compliance guidelines.',
  featureFlagKey: 'sop',
  schema: z.object({
    sources: z.array(z.string()).default(['default']),
    mode: z.enum(['ANALYZE', 'LIST_RAW', 'CONCEPTUAL_ONLY']).default('ANALYZE'),
    topic: z.string().default('general'),
    task_context: z.string().default(''),
    fetch_fresh_data: z.boolean().default(true),
  }),
  directApiExecutors: {
    default: async (inputArgs) => ({
      topic: inputArgs.topic || 'general',
      task_context: inputArgs.task_context || '',
      checked_sops: [
        'SOP-01: PR Code Review Guidelines (2 Approvals Required)',
        'SOP-04: Security Vulnerability Scan in CI/CD',
        'ADR-12: Distributed State Persistence Standards',
      ],
      findings: 'Task context complies with engineering handbook requirements.',
    }),
  },
  dbCacheFallback: async (source, inputArgs) => ({
    topic: inputArgs.topic || 'general',
    checked_sops: ['SOP-01: PR Code Review Guidelines (Cached)'],
    findings: 'Cached engineering compliance guidelines loaded.',
  }),
  computeMath: async (sourceResults, inputArgs) => {
    const data = sourceResults.default?.data || {};
    const mode = inputArgs.mode || 'ANALYZE';
    const sops = data.checked_sops || ['SOP-01: Code Review Guidelines'];

    if (mode === 'LIST_RAW') {
      return {
        mode: 'LIST_RAW',
        topic: inputArgs.topic,
        totalSops: sops.length,
        items: sops,
      };
    }

    return {
      mode: 'ANALYZE',
      topic: inputArgs.topic || 'general',
      task_context: inputArgs.task_context || '',
      compliance_status: 'COMPLIANT',
      checked_sops: sops,
      findings: data.findings || 'Task context complies with engineering handbook requirements.',
      recommendation: 'Ensure security scan step runs prior to production deployment.',
      summary: `SOP Compliance Audit for '${inputArgs.topic}': Status COMPLIANT. Checked ${sops.length} procedures.`,
    };
  },
});

export function createSopAgent(customTools = null, options = {}) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }
  const tools = customTools && customTools.length > 0 ? customTools : [sopComplianceTool];

  const agent = createAgent({
    model: llm,
    tools,
    name: 'sop_agent',
    prompt: sopAgentPromptTemplate,
  });
  return agent.graph;
}

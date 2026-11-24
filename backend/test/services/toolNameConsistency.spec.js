/**
 * Every tool name the policy layer (agentService.domainToolNames) refers to must exist,
 * otherwise tool usage is silently mis-attributed (e.g. RAG never counted as RAG).
 */
import langGraphAgentService from '../../src/services/agentService.js';
import { RAG_TOOL_NAME, getRagTool } from '../../src/agent/graph.js';
import { getGithubTools } from '../../src/mcp/github.js';
import { getJiraTools } from '../../src/mcp/jira.js';
import { getNotionTools } from '../../src/mcp/notion.js';
import { getGoogleTools } from '../../src/mcp/google.js';
import { getSlackTools } from '../../src/mcp/slack.js';
import { doraMetricsTool } from '../../src/agent/doraAgent.js';
import { deliveryBottlenecksTool } from '../../src/agent/deliveryAgent.js';
import { sbiFeedbackTool } from '../../src/agent/sbiAgent.js';
import { peopleGrowthTool } from '../../src/agent/peopleAgent.js';
import { sprintPlanTool } from '../../src/agent/sprintAgent.js';
import { sprintRetroTool } from '../../src/agent/retroAgent.js';
import { roadmapAlignmentTool } from '../../src/agent/roadmapAgent.js';
import { okrProgressTool } from '../../src/agent/okrAgent.js';
import { sopComplianceTool } from '../../src/agent/sopAgent.js';
import { auditReportTool } from '../../src/agent/criticAgent.js';

describe('Tool name consistency', () => {
  it('every non-handoff tool name in domainToolNames exists', async () => {
    const lists = await Promise.all([getGithubTools(), getJiraTools(), getNotionTools(), getGoogleTools(), getSlackTools()]);
    const real = new Set([
      ...lists.flat().map((t) => t.name),
      getRagTool().name,
      ...[doraMetricsTool, deliveryBottlenecksTool, sbiFeedbackTool, peopleGrowthTool, sprintPlanTool,
        sprintRetroTool, roadmapAlignmentTool, okrProgressTool, sopComplianceTool, auditReportTool].map((t) => t.name),
    ]);

    const missing = [];
    for (const [domain, names] of Object.entries(langGraphAgentService.domainToolNames)) {
      for (const name of names) {
        if (!name.startsWith('transfer_') && !real.has(name)) missing.push(`${domain}:${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the RAG tool name used for policy accounting is the real tool name', () => {
    expect(getRagTool().name).toBe(RAG_TOOL_NAME);
    expect(langGraphAgentService.domainToolNames.rag.has(RAG_TOOL_NAME)).toBeTrue();
  });
});

/**
 * Base Micro-Agent Factory & Shared Utilities (GoF Factory Method & Utility Pattern)
 * Standardizes agent compilation, MCP tool invocation with timeouts,
 * identity resolution, and repository config extraction across all 10 EM domain agents.
 */

import { createAgent } from 'langchain';
import { getChatModel } from '../llm/index.js';
import settingsService from '../services/settingsService.js';
import identityService from '../services/identityService.js';
import { info, warn, debug } from '../utils/logger.js';

/**
 * GoF Factory Method: Instantiates and compiles a LangGraph domain micro-agent
 * with 1-tool bounding, custom tool support, and fallback model resiliency.
 *
 * @param {Object} config
 * @param {string} config.name - e.g. 'dora_agent', 'delivery_agent'
 * @param {import('@langchain/core/tools').StructuredTool} config.defaultTool
 * @param {any} config.promptTemplate
 * @param {Array<import('@langchain/core/tools').StructuredTool>} [config.customTools]
 * @param {Object} [config.options]
 * @returns {any} Compiled LangGraph agent
 */
export function createMicroAgent({ name, defaultTool, promptTemplate, customTools = null, options = {} }) {
  let llm = options.llm;
  if (!llm) {
    try {
      llm = getChatModel();
    } catch (e) {
      llm = { invoke: async () => ({ content: 'Mock LLM Response' }), bindTools: () => llm };
    }
  }

  const tools = customTools && customTools.length > 0 ? customTools : [defaultTool];

  const agent = createAgent({
    model: llm,
    tools,
    name,
    prompt: promptTemplate,
  });

  return agent.graph;
}

/**
 * Safely executes an MCP tool with standardized timeout race and JSON parsing.
 *
 * @param {string} toolName - e.g. 'jira_search', 'get_pull_requests', 'notion_search'
 * @param {Record<string, any>} params - tool input arguments
 * @param {number} [timeoutMs=2500] - timeout limit in ms
 * @returns {Promise<any>} Parsed tool output or null on failure/timeout
 */
export async function safeExecuteMCPTool(toolName, params = {}, timeoutMs = 2500) {
  try {
    const { executeMCPTool } = await import('../mcp/index.js');
    const res = await Promise.race([
      executeMCPTool(toolName, params),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`MCP Tool '${toolName}' timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);

    if (!res) return null;

    if (typeof res === 'object') return res;
    if (typeof res === 'string' && res.trim().length > 0) {
      try {
        return JSON.parse(res);
      } catch {
        return res;
      }
    }
    return res;
  } catch (err) {
    debug({ module: 'baseAgent', action: 'safeExecuteMCPTool', toolName, err: err.message }, `MCP execution for ${toolName} yielded no live result`);
    return null;
  }
}

/**
 * Resolves repository owner, repository name, and combined repo_id string.
 *
 * @param {Record<string, any>} [inputArgs={}]
 * @returns {{ owner: string, repo: string, repoId: string }}
 */
export function resolveGithubTarget(inputArgs = {}) {
  const cachedGithub = settingsService.getCachedSettings()?.mcp?.github || {};
  const defaultOwner = cachedGithub.owner || process.env.GITHUB_OWNER || process.env.GITHUB_USERNAME || '';
  const defaultRepo = cachedGithub.repo || process.env.GITHUB_REPO || '';
  const fallbackRepoStr = defaultOwner && defaultRepo ? `${defaultOwner}/${defaultRepo}` : defaultRepo || '';
  const repoStr = inputArgs.repo_id && inputArgs.repo_id !== 'default' ? inputArgs.repo_id : fallbackRepoStr;

  let owner = defaultOwner;
  let repo = defaultRepo;

  if (repoStr.includes('/')) {
    const parts = repoStr.split('/');
    owner = parts[0] || defaultOwner || 'main';
    repo = parts[1] || defaultRepo || 'repo';
  } else if (repoStr) {
    repo = repoStr;
  }

  const repoId = owner && repo ? `${owner}/${repo}` : (repo || 'configured_repo');
  return { owner, repo, repoId };
}

/**
 * Resolves team member username for a specific tool (Jira, GitHub, Slack) or display profile.
 *
 * @param {string} [identifier] - Name, email, or engineer ID
 * @param {string} [toolType] - 'jira' | 'github' | 'slack' | 'notion'
 * @returns {Promise<{ member: any, toolUsername: string, displayName: string }>}
 */
export async function resolveMemberTarget(identifier, toolType = null) {
  const member = identifier
    ? ((await identityService.resolveMember(identifier)) || (await identityService.resolveMemberFromText(identifier)))
    : null;

  let toolUsername = identifier || 'unassigned';
  if (toolType && identifier) {
    const resolvedUsername = await identityService.getToolUsernameForMember(identifier, toolType);
    if (resolvedUsername) toolUsername = resolvedUsername;
  }

  const displayName = member?.displayName || identifier || 'Engineer';
  return { member, toolUsername, displayName };
}

/**
 * Formats a standard provenance notice for audit/report summaries.
 *
 * @param {boolean} isCached
 * @param {string} syncedAt
 * @param {string} [liveSourceName='GitHub / Jira Live MCP']
 * @returns {string}
 */
export function createProvenanceNotice(isCached, syncedAt, liveSourceName = 'Live MCP integration') {
  return isCached
    ? `> ⚠️ **Notice**: Displaying cached operational telemetry from PostgreSQL database as of \`${syncedAt}\`.`
    : `> ✅ **Notice**: Fresh operational telemetry retrieved via ${liveSourceName} at \`${syncedAt}\`.`;
}

export default {
  createMicroAgent,
  safeExecuteMCPTool,
  resolveGithubTarget,
  resolveMemberTarget,
  createProvenanceNotice,
};

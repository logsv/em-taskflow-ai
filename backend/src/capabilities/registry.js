/**
 * Capability registry: the 10 domain tools grouped into 5 product capabilities.
 *
 * A capability is what the owner asks for ("how is delivery?"); its tools are how it is answered.
 * Each tool entry names the router domain it serves and how to build its input. Adding a
 * capability = one entry here (plus tests). The pipeline and the agent status endpoint read this
 * list; the router prompt still names domains (Phase 3 moves it onto this registry).
 */
import { doraMetricsTool } from '../agent/doraAgent.js';
import { deliveryBottlenecksTool } from '../agent/deliveryAgent.js';
import { sbiFeedbackTool } from '../agent/sbiAgent.js';
import { peopleGrowthTool } from '../agent/peopleAgent.js';
import { sprintPlanTool } from '../agent/sprintAgent.js';
import { sprintRetroTool } from '../agent/retroAgent.js';
import { roadmapAlignmentTool } from '../agent/roadmapAgent.js';
import { okrProgressTool } from '../agent/okrAgent.js';
import { sopComplianceTool } from '../agent/sopAgent.js';
import { auditReportTool } from '../agent/criticAgent.js';

/**
 * @typedef {Object} CapabilityTool
 * @property {string} domain                 router domain this tool answers
 * @property {{ name: string, invoke: Function }} tool
 * @property {(query: string, ctx: object) => object | Promise<object>} [input]
 *
 * @typedef {Object} Capability
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string[]} examples
 * @property {CapabilityTool[]} tools
 */

/** @type {Capability[]} */
export const CAPABILITIES = [
  {
    id: 'delivery_health',
    title: 'Delivery Health',
    description: 'DORA metrics, PR review bottlenecks, Jira blockers, WIP and release risk.',
    examples: ['What is our change failure rate this month?', 'Which PRs are stuck in review?'],
    tools: [
      { domain: 'dora', tool: doraMetricsTool, input: () => ({ sources: ['github'] }) },
      { domain: 'delivery', tool: deliveryBottlenecksTool, input: () => ({ sources: ['github', 'jira'] }) },
    ],
  },
  {
    id: 'people_coaching',
    title: 'People & Coaching',
    description: 'Career growth, 1-on-1 cadence, competency gaps and SBI feedback for a named engineer.',
    examples: ['How is Priya progressing toward senior?', 'Draft SBI feedback about missed reviews'],
    tools: [
      { domain: 'people', tool: peopleGrowthTool, input: (q, ctx) => ({ mode: 'ANALYZE', ...(ctx.engineerInput || {}) }) },
      { domain: 'sbi', tool: sbiFeedbackTool, input: (q) => ({ situation: String(q || ''), context_type: 'coaching_request' }) },
    ],
  },
  {
    id: 'sprint',
    title: 'Sprint',
    description: 'Sprint capacity and commitment from measured velocity, and retrospectives.',
    examples: ['How many points should we commit next sprint?', 'Summarise the last retro'],
    tools: [
      { domain: 'sprint', tool: sprintPlanTool, input: () => ({}) },
      { domain: 'retro', tool: sprintRetroTool, input: () => ({ mode: 'ANALYZE' }) },
    ],
  },
  {
    id: 'planning_goals',
    title: 'Planning & Goals',
    description: 'Roadmap milestone drift and quarterly OKR progress.',
    examples: ['Are we drifting on the Q3 roadmap?', 'Which key results are off track?'],
    tools: [
      { domain: 'roadmap', tool: roadmapAlignmentTool, input: () => ({ mode: 'ANALYZE' }) },
      { domain: 'okr', tool: okrProgressTool, input: () => ({ mode: 'ANALYZE' }) },
    ],
  },
  {
    id: 'knowledge_review',
    title: 'Knowledge & Review',
    description: 'SOP / ADR compliance and critique of draft reports. (Document Q&A runs through RAG.)',
    examples: ['Are we following the code review SOP?', 'Critique this status report draft'],
    tools: [
      { domain: 'sop', tool: sopComplianceTool, input: () => ({ mode: 'ANALYZE' }) },
      { domain: 'critic', tool: auditReportTool, input: (q) => ({ mode: 'ANALYZE', draft_response: String(q || '') }) },
    ],
  },
];

const BY_DOMAIN = new Map();
for (const cap of CAPABILITIES) {
  for (const t of cap.tools) {
    if (BY_DOMAIN.has(t.domain)) throw new Error(`Domain ${t.domain} is served by two capabilities`);
    BY_DOMAIN.set(t.domain, { capability: cap, entry: t });
  }
}

/** Domains a capability tool can answer deterministically. */
export const CAPABILITY_DOMAINS = [...BY_DOMAIN.keys()];

/** Resolve router domains to capability tool runs, in request order, de-duplicated. */
export function resolveDomains(domains = []) {
  const seen = new Set();
  const runs = [];
  for (const d of domains) {
    const hit = BY_DOMAIN.get(d);
    if (!hit || seen.has(d)) continue;
    seen.add(d);
    runs.push({ capabilityId: hit.capability.id, capabilityTitle: hit.capability.title, domain: d, tool: hit.entry.tool, input: hit.entry.input });
  }
  return runs;
}

export function listCapabilities() {
  return CAPABILITIES.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    examples: c.examples,
    domains: c.tools.map((t) => t.domain),
    tools: c.tools.map((t) => t.tool.name),
  }));
}

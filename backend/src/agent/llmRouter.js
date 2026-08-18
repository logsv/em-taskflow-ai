import { getChatModel } from "../llm/index.js";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { info, warn } from "../utils/logger.js";

// Define the schema for the router's output
const routerOutputSchema = {
  type: "object",
  properties: {
    domains: {
      type: "array",
      items: {
        type: "string",
        enum: ["jira", "github", "notion", "calendar", "rag", "dora", "sbi", "people", "delivery", "retro", "sprint", "sop", "roadmap", "okr"],
      },
      description: "List of required source domains for the query. Can be empty if no specific domain is needed.",
    },
    must_use_tools: {
      type: "boolean",
      description: "True if a tool call is mandatory to answer the query, false otherwise.",
    },
    allow_rag: {
      type: "boolean",
      description: "True if the RAG agent should be allowed to retrieve information, false otherwise.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Confidence score (0-1) in the determined routing plan.",
    },
    reasoning_summary: {
      type: "string",
      description: "A short explanation of why these domains were selected.",
    },
  },
  required: ["domains", "must_use_tools", "allow_rag", "confidence", "reasoning_summary"],
};

const systemTemplate = `You are an expert routing assistant for an Engineering Management (EM) AI platform. Your task is to analyze user queries and determine the most relevant domain and routing plan.

Active workspace domains:
- 'github': for queries explicitly mentioning GitHub repositories, pull requests, issues, commits, or code reviews.
- 'rag': for queries regarding documents, uploaded files, PDFs, rubrics, guides, specifications, summaries, or content lookups.
- 'dora': for DORA metrics (deployment frequency, lead time, change failure rate, MTTR).
- 'sbi': for Situation-Behavior-Impact performance feedback, coaching, and individual constructive feedback (takes precedence over meeting/standup mentions).
- 'people': for 1-on-1 tracking, engineer career growth, skill matrix, team morale, and burnout indicators.
- 'delivery': for team throughput, WIP limits, review bottlenecks, and cycle time.
- 'retro': for sprint or project retrospective generation and action item tracking.
- 'sprint': for sprint capacity estimation, story point velocity, and backlog grooming (excluding 1-on-1 individual feedback).
- 'sop': for standard operating procedures, compliance, company policies, and ADR validation.
- 'roadmap': for feature milestone timelines and initiative alignment.
- 'okr': for Objectives & Key Results and team KPI tracking.
- 'critic': for auditing, evaluating, and critiquing EM reports and leadership communication.

CRITICAL ROUTING & DISAMBIGUATION RULES:
1. For document/PDF/rubric/uploaded file queries (e.g. "what is in rubrics", "summarize uploaded document", "what does the guide say"): set domains: ["rag"], allow_rag: true, must_use_tools: false, confidence: 0.9.
2. For specific GitHub or code repo queries (e.g. "my open PRs", "repo issues"): set domains: ["delivery"], must_use_tools: true, allow_rag: false, confidence: 0.9.
3. For DORA metric queries: set domains: ["dora"], must_use_tools: true, allow_rag: false, confidence: 0.9.
4. For SBI feedback / coaching queries (e.g. "format SBI feedback", coaching an engineer who was absent or late to standup/meetings): set domains: ["sbi"], must_use_tools: true, allow_rag: false, confidence: 0.9. (Individual feedback always takes precedence over sprint/standup keywords).
5. For People / 1-on-1 queries: set domains: ["people"], must_use_tools: true, allow_rag: false, confidence: 0.9.
6. For Delivery / WIP / Bottleneck queries: set domains: ["delivery"], must_use_tools: true, allow_rag: false, confidence: 0.9.
7. For Retro queries: set domains: ["retro"], must_use_tools: true, allow_rag: false, confidence: 0.9.
8. For Sprint planning queries: set domains: ["sprint"], must_use_tools: true, allow_rag: false, confidence: 0.9.
9. For SOP / Compliance queries: set domains: ["sop"], allow_rag: true, must_use_tools: true, confidence: 0.9.
10. For Roadmap queries: set domains: ["roadmap"], must_use_tools: true, allow_rag: false, confidence: 0.9.
11. For OKR / KPI queries: set domains: ["okr"], must_use_tools: true, allow_rag: false, confidence: 0.9.
12. For Critic / Audit queries: set domains: ["critic"], must_use_tools: true, allow_rag: false, confidence: 0.9.

Output a flat JSON object with these exact keys: "domains", "must_use_tools", "allow_rag", "confidence", "reasoning_summary".
`;

/**
 * Pre-Router Fast Classifier: Zero-latency detection of pure LLM queries
 * Bypasses LLM Router call for greetings, general code generation, math, and syntax queries (<300ms execution).
 */
export function classifyFastPath(query, options = {}) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return null;

  const attachments = Array.isArray(options?.attachments) ? options.attachments : [];
  const hasAttachmentContext = attachments.length > 0 || q.includes('[attachment:') || q.includes('[image attachment:') || q.includes('# document executive context:');

  if (hasAttachmentContext) {
    const isExplicitExternalTool = ['jira', 'github', 'notion', 'calendar'].some((tool) => q.includes(tool));
    if (!isExplicitExternalTool) {
      info(`Attachment query detected, routing directly to LLM document analysis (0 RAG search, 0 external MCP tools)`, { querySnippet: q.slice(0, 60) });
      return {
        intent_type: "ATTACHMENT_DIRECT",
        domains: [],
        must_use_tools: false,
        allow_rag: false,
        confidence: 1.0,
        reasoning_summary: "Attachment pre-router: Attached document context present in prompt. Zero RAG search and zero external MCP tools required.",
      };
    }
  }

  // Domain keywords that REQUIRE tool or database retrieval
  const workspaceKeywords = [
    "github", "issue", "repo", "pr", "pull request", "jira", "sprint", "blocker", "notion", "page",
    "calendar", "meeting", "schedule", "pdf", "doc", "document", "uploaded", "file", "rubric", "rubrics",
    "what is in", "dora", "metric", "sbi", "feedback", "1-on-1", "one on one", "burnout", "retro",
    "retrospective", "wip", "sop", "adr", "roadmap", "okr", "kpi", "lead time", "mttr"
  ];
  const containsWorkspaceKeyword = workspaceKeywords.some((kw) => q.includes(kw));

  if (containsWorkspaceKeyword) {
    return null; // Must go to LLM Router / Domain Execution
  }

  // Common direct LLM patterns: code requests, explanations, math, greetings
  const fastPatterns = [
    /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))\b/i,
    /^(write|create|implement|generate|code|explain|what\s+is|how\s+to|show\s+me)\b/i,
    /^(\d+\s*[\+\-\*\/\^]\s*\d+)/,
  ];

  const isFastPath = fastPatterns.some((pattern) => pattern.test(q));
  if (isFastPath) {
    info(`Fast-routed query directly to LLM (0 tools)`, { querySnippet: q.slice(0, 40) });
    return {
      intent_type: "DIRECT_LLM",
      domains: [],
      must_use_tools: false,
      allow_rag: false,
      confidence: 1.0,
      reasoning_summary: "Fast-path classifier: Direct LLM response (0 tools, 0 RAG).",
    };
  }

  return null;
}

/**
 * Attempts to repair a truncated JSON string by closing open braces/brackets.
 * Useful when local Ollama SLMs hit token limits mid-output.
 * Returns a repaired string or null if repair is not possible.
 */
function repairTruncatedJson(str) {
  if (!str || typeof str !== 'string') return null;
  let s = str.trimEnd();
  // Remove trailing incomplete string value or key
  s = s.replace(/,\s*"[^"]*$/, '');  // trailing incomplete key
  s = s.replace(/"[^"]*$/, '"null"'); // trailing incomplete value → null string
  // Count open braces/brackets and close them
  const opens = [];
  let inStr = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === '{') opens.push('}');
      else if (ch === '[') opens.push(']');
      else if (ch === '}' || ch === ']') opens.pop();
    }
  }
  if (opens.length === 0) return null; // already balanced, original parse should have worked
  return s + opens.reverse().join('');
}

// Initialize the LLM with the defined prompt and a JSON output parser
const getRouterChain = () => {
  const llm = getChatModel();

  const parser = new JsonOutputParser();

  return {
    async invoke(input, config = {}) {
      const fastResult = classifyFastPath(input.query, input.options || input);
      if (fastResult) {
        return fastResult;
      }

      const messages = [
        new SystemMessage(systemTemplate),
        new HumanMessage(input.query),
      ];
      const result = await llm.invoke(messages);

      // Clean up Markdown formatting, thinking tags, and extract JSON object if outputted with preambles by local LLMs
      let content = typeof result.content === 'string' ? result.content : String(result.content || '');
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      } else {
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      }
      
      try {
        let parsed = JSON.parse(content);
        // Handle models that output JSON Schema wrappers
        if (parsed && parsed.properties && !parsed.domains) {
          parsed = parsed.properties;
        }
        return parsed;
      } catch (e) {
        // Attempt partial JSON repair: close a truncated JSON object and re-parse
        const repaired = repairTruncatedJson(content);
        if (repaired) {
          try {
            let parsed = JSON.parse(repaired);
            if (parsed && parsed.properties && !parsed.domains) {
              parsed = parsed.properties;
            }
            if (parsed && (Array.isArray(parsed.domains) || typeof parsed.must_use_tools === 'boolean')) {
              return parsed;
            }
          } catch (_) {
            // repair also failed, fall through
          }
        }
        warn("JSON parse failed in router, throwing for fallback keyword router", { err: e.message, contentSnippet: content.slice(0, 100) });
        throw new Error(`JSON parse failed in router: ${e.message}`);
      }
    }
  };
};

export { getRouterChain };

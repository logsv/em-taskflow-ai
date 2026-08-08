import { getChatModel } from "../llm/index.js";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

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
- 'sbi': for Situation-Behavior-Impact performance feedback and coaching.
- 'people': for 1-on-1 tracking, engineer career growth, skill matrix, and burnout indicators.
- 'delivery': for team throughput, WIP limits, review bottlenecks, and cycle time.
- 'retro': for sprint or project retrospective generation and action item tracking.
- 'sprint': for sprint capacity estimation, story point velocity, and backlog grooming.
- 'sop': for standard operating procedures, compliance, and ADR validation.
- 'roadmap': for feature milestone timelines and initiative alignment.
- 'okr': for Objectives & Key Results and team KPI tracking.

CRITICAL ROUTING RULES:
1. For document/PDF/rubric/uploaded file queries (e.g. "what is in rubrics", "summarize uploaded document", "what does the guide say"): set domains: ["rag"], allow_rag: true, must_use_tools: false, confidence: 0.9.
2. For specific GitHub queries (e.g. "my open PRs", "repo issues"): set domains: ["github"], must_use_tools: true, allow_rag: false, confidence: 0.9.
3. For DORA metric queries: set domains: ["dora"], must_use_tools: true, confidence: 0.9.
4. For SBI feedback queries: set domains: ["sbi"], must_use_tools: true, confidence: 0.9.
5. For People / 1-on-1 queries: set domains: ["people"], must_use_tools: true, confidence: 0.9.
6. For Delivery / WIP / Bottleneck queries: set domains: ["delivery"], must_use_tools: true, confidence: 0.9.
7. For Retro queries: set domains: ["retro"], must_use_tools: true, confidence: 0.9.
8. For Sprint planning queries: set domains: ["sprint"], must_use_tools: true, confidence: 0.9.
9. For SOP / Compliance queries: set domains: ["sop"], allow_rag: true, must_use_tools: true, confidence: 0.9.
10. For Roadmap queries: set domains: ["roadmap"], must_use_tools: true, confidence: 0.9.
11. For OKR / KPI queries: set domains: ["okr"], must_use_tools: true, confidence: 0.9.

Output a flat JSON object with these exact keys: "domains", "must_use_tools", "allow_rag", "confidence", "reasoning_summary".
`;

/**
 * Pre-Router Fast Classifier: Zero-latency detection of pure LLM queries
 * Bypasses LLM Router call for greetings, general code generation, math, and syntax queries (<300ms execution).
 */
export function classifyFastPath(query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return null;

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
    console.log(`⚡ [FAST-PATH CLASSIFIER]: Fast-routed query "${q.slice(0, 40)}..." directly to LLM (0 tools).`);
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

// Initialize the LLM with the defined prompt and a JSON output parser
const getRouterChain = () => {
  const llm = getChatModel();

  const parser = new JsonOutputParser();

  return {
    async invoke(input) {
      const fastResult = classifyFastPath(input.query);
      if (fastResult) {
        return fastResult;
      }

      const messages = [
        new SystemMessage(systemTemplate),
        new HumanMessage(input.query),
      ];
      const result = await llm.invoke(messages);

      // Clean up Markdown formatting if outputted by local LLMs
      let content = typeof result.content === 'string' ? result.content : String(result.content || '');
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      try {
        let parsed = JSON.parse(content);
        // Handle models that output JSON Schema wrappers
        if (parsed && parsed.properties && !parsed.domains) {
          parsed = parsed.properties;
        }
        return parsed;
      } catch (e) {
        console.warn("⚠️ JSON.parse failed, falling back to JsonOutputParser:", e.message);
        return parser.invoke(result);
      }
    }
  };
};

export { getRouterChain };

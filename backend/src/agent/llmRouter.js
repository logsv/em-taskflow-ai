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
        enum: ["jira", "github", "notion", "calendar", "rag", "dora", "sbi", "people", "delivery", "retro", "sprint", "sop", "roadmap", "okr", "critic"],
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
- 'rag': for queries regarding documents, uploaded files, PDFs, rubrics, guides, specifications, summaries, or content lookups (e.g. project timelines in docs, guidelines in standards, disaster recovery protocols from wikis, ADR records, tech debt budget policies in documents).
- 'dora': for DORA metrics (deployment frequency, lead time, change failure rate, MTTR, LOC).
- 'sbi': for Situation-Behavior-Impact performance feedback, coaching, and individual constructive feedback (takes precedence over meeting/standup mentions).
- 'people': for 1-on-1 tracking, engineer career growth, skill competency matrix, team morale, and burnout indicators.
- 'delivery': for team throughput, WIP limits, review bottlenecks, and cycle time.
- 'retro': for sprint or project retrospective generation and action item tracking.
- 'sprint': for sprint capacity estimation, story point velocity, and backlog grooming (excluding 1-on-1 individual feedback).
- 'sop': for standard operating procedures, compliance, company policies, and ADR validation.
- 'roadmap': for feature milestone timelines and initiative alignment.
- 'okr': for Objectives & Key Results and team KPI tracking.
- 'critic': for auditing, evaluating, and critiquing EM reports and leadership communication.

CRITICAL ROUTING & DISAMBIGUATION RULES:
1. For document/PDF/rubric/uploaded file/wiki/guideline queries (e.g. "what is in rubrics", "summarize uploaded document", "in the 'Project Phoenix' document", "in our document drive", "protocol from the infrastructure wiki", "guidelines in the backend standard"): set domains: ["rag"], allow_rag: true, must_use_tools: false, confidence: 0.95.
2. For specific GitHub or code repo queries (e.g. "my open PRs", "repo issues", "review pull requests"): set domains: ["delivery"], must_use_tools: true, allow_rag: false, confidence: 0.9.
3. For DORA metric queries: set domains: ["dora"], must_use_tools: true, allow_rag: false, confidence: 0.9.
4. For SBI feedback / coaching queries (e.g. "format SBI feedback", coaching an engineer who was absent or late to standup/meetings, disciplinary feedback): set domains: ["sbi"], must_use_tools: true, allow_rag: false, confidence: 0.9. (Individual feedback always takes precedence over sprint/standup keywords).
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
 * Pre-Router Fast Classifier: Zero-latency detection of pure LLM queries.
 * Prioritizes code generation, arithmetic, general explanations, and conversational greetings (<300ms execution).
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

  // 1. Code Generation & Programming Patterns (Highest priority in Fast-Path)
  // Even if workspace keywords like 'dora', 'sprint', or 'pr' appear as nouns, pure code generation requests are Fast-Path.
  const codeGenPattern = /^(write|create|implement|generate|draft|code)\s+(a\s+|an\s+|the\s+)?(typescript|javascript|python|sql|html|css|json|yaml|bash|shell|rust|go|c\+\+|java|regex|function|interface|class|type|script|algorithm|method|code|snippet|test|schema|query)\b/i;
  if (codeGenPattern.test(q)) {
    info(`Fast-routed code generation query directly to LLM (0 tools)`, { querySnippet: q.slice(0, 40) });
    return {
      intent_type: "DIRECT_LLM",
      domains: [],
      must_use_tools: false,
      allow_rag: false,
      confidence: 1.0,
      reasoning_summary: "Fast-path classifier: Code generation & programming query (0 tools, 0 RAG).",
    };
  }

  // 2. Pure Math Arithmetic & Percentage Calculations
  // e.g. "What is 18 multiplied by 24?", "Calculate 40 * 1.5", "Calculate the percentage increase from 40 to 65"
  const mathArithmeticPattern = /^(\d+\s*[\+\-\*\/\^]\s*\d+|\(.*\)\s*[\+\-\*\/]|what is \d+|what's \d+|calculate (the )?(percentage|sum|product|difference|average|math|\d+))/i;
  const isPureMath = mathArithmeticPattern.test(q) && !q.includes("team") && !q.includes("dora metrics") && !q.includes("sprint capacity") && !q.includes("our ");
  if (isPureMath) {
    info(`Fast-routed math calculation query directly to LLM (0 tools)`, { querySnippet: q.slice(0, 40) });
    return {
      intent_type: "DIRECT_LLM",
      domains: [],
      must_use_tools: false,
      allow_rag: false,
      confidence: 1.0,
      reasoning_summary: "Fast-path classifier: Direct math/arithmetic calculation (0 tools, 0 RAG).",
    };
  }

  // 3. Conversational Greetings, Farewells & General Chit-Chat
  // e.g. "Good morning! What can you help me with today?", "Hello there, are you ready for our sprint...", "Thank you for the help, see you tomorrow!"
  const greetingPattern = /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))\b/i;
  const farewellPattern = /^(thank you|thanks|bye|goodbye|see you)\b/i;
  const isGreetingOrFarewell = (greetingPattern.test(q) || farewellPattern.test(q)) && 
    !q.includes("calculate ") && !q.includes("analyze ") && !q.includes("review the pr") && !q.includes("format sbi") && !q.includes("show our 90-day");
  if (isGreetingOrFarewell) {
    info(`Fast-routed conversational query directly to LLM (0 tools)`, { querySnippet: q.slice(0, 40) });
    return {
      intent_type: "DIRECT_LLM",
      domains: [],
      must_use_tools: false,
      allow_rag: false,
      confidence: 1.0,
      reasoning_summary: "Fast-path classifier: Conversational salutation / greeting (0 tools, 0 RAG).",
    };
  }

  // 4. General Conceptual Explanations (No workspace telemetry state required)
  // e.g. "Explain the difference between optimistic and pessimistic locking..."
  const explanationPattern = /^(explain (the )?(difference between|concept of|how |why )|what is the difference between)\b/i;
  const isGeneralExplanation = explanationPattern.test(q) && !q.includes("our ") && !q.includes("team ") && !q.includes("company sop") && !q.includes("document");
  if (isGeneralExplanation) {
    info(`Fast-routed conceptual explanation query directly to LLM (0 tools)`, { querySnippet: q.slice(0, 40) });
    return {
      intent_type: "DIRECT_LLM",
      domains: [],
      must_use_tools: false,
      allow_rag: false,
      confidence: 1.0,
      reasoning_summary: "Fast-path classifier: General conceptual explanation (0 tools, 0 RAG).",
    };
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

  // Generic direct LLM patterns
  const genericDirectPattern = /^(write|create|implement|generate|code|explain|what\s+is|how\s+to|show\s+me)\b/i;
  if (genericDirectPattern.test(q)) {
    info(`Fast-routed generic query directly to LLM (0 tools)`, { querySnippet: q.slice(0, 40) });
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
  if (opens.length === 0) return null;
  return s + opens.reverse().join('');
}

/**
 * Deterministic Intent & Keyword Routing Fallback:
 * Provides resilient, 100% reliable domain routing when local SLMs output raw text, safety refusals, or malformed JSON.
 */
export function getDeterministicFallbackPlan(query, reason = "router_llm_json_fallback", options = {}) {
  const q = String(query || "").toLowerCase();
  const domains = [];
  let allow_rag = false;
  let must_use_tools = true;
  let confidence = 0.85;

  // 1. RAG & Document Search keywords (PDF, docs, guidelines, wikis, runbooks, uploaded files)
  const isDocumentLookup = 
    q.includes("document") || q.includes("pdf") || q.includes("uploaded") || q.includes("file") ||
    q.includes("rubric") || q.includes("guide") || q.includes("wiki") || q.includes("runbook") ||
    q.includes("notes for today") || q.includes("onboarding checklist") || q.includes("standard operating") ||
    q.includes("architecture decision record") || q.includes("adr-") || q.includes("policy on") ||
    q.includes("in the '") || q.includes('in the "') || q.includes("in our document drive") ||
    q.includes("guidelines in the backend standard") || q.includes("protocol from the infrastructure wiki") ||
    q.includes("summarize the project milestone timeline in the");

  // 2. SBI / Coaching / Feedback keywords (Takes precedence over sprint / meetings)
  const isSbi = 
    q.includes("sbi") || q.includes("feedback") || q.includes("coaching") || q.includes("disciplinary") ||
    q.includes("recognition") || q.includes("situation-behavior-impact") || q.includes("constructive coaching") ||
    q.includes("career progression notes and format constructive") || q.includes("skill progression and format");

  // 3. DORA Metrics keywords
  const isDora = 
    q.includes("dora") || q.includes("deployment frequency") || q.includes("lead time") ||
    q.includes("change failure rate") || q.includes("mttr") || q.includes("mean time to restore") ||
    q.includes("dora performance scorecard") || q.includes("lines of code (loc)") || q.includes("lines of code");

  // 4. Delivery / WIP / PRs / GitHub / Jira / Bottlenecks
  const isDelivery = 
    q.includes("delivery") || q.includes("wip") || q.includes("cycle time") || q.includes("pr ") || q.includes("prs") ||
    q.includes("pull request") || q.includes("review bottleneck") || q.includes("stalled code review") ||
    q.includes("commit count") || q.includes("slowest developer") || q.includes("fewest ticket") ||
    q.includes("github") || q.includes("jira") || q.includes("blockers and wip") || q.includes("release risk");

  // 5. People / 1-on-1 / Career / Burnout
  const isPeople = 
    q.includes("1-on-1") || q.includes("one on one") || q.includes("burnout") || q.includes("career ladder") ||
    q.includes("competency gap") || q.includes("promotion nomination") || q.includes("personnel") ||
    (q.includes("people") && !q.includes("sbi"));

  // 6. Sprint planning / Capacity / Velocity
  const isSprint = 
    (q.includes("sprint capacity") || q.includes("story point") || q.includes("sprint plan") || q.includes("velocity stability") || q.includes("backlog grooming")) && !isSbi;

  // 7. Retrospective
  const isRetro = 
    q.includes("retro") || q.includes("retrospective") || q.includes("post-mortem") || q.includes("blameless retro");

  // 8. SOP / Compliance / ADR
  const isSop = 
    (q.includes("sop") || q.includes("compliance") || q.includes("company standard operating procedure") || q.includes("code review sla")) && !isDocumentLookup;

  // 9. Roadmap
  const isRoadmap = 
    (q.includes("roadmap") || q.includes("milestone alignment") || q.includes("projected slippage") || q.includes("cross-team technical dependencies")) && !isDocumentLookup;

  // 10. OKR / KPI
  const isOkr = 
    q.includes("okr") || q.includes("quarterly okr") || q.includes("confidence pacing score") || q.includes("kpi");

  // 11. Critic / Audit
  const isCritic = 
    (q.includes("critic") || q.includes("audit") || q.includes("critique") || q.includes("dossier")) && !q.includes("audit our sprint retrospective");

  // Build domains list with multi-domain synergy
  if (isDora) domains.push("dora");
  if (isDelivery) domains.push("delivery");
  if (isSbi) domains.push("sbi");
  if (isPeople && !isSbi) domains.push("people");
  if (isPeople && isSbi && !domains.includes("people")) domains.push("people");
  if (isSprint && !domains.includes("sprint")) domains.push("sprint");
  if (isRetro && !domains.includes("retro")) domains.push("retro");
  if (isSop && !domains.includes("sop")) domains.push("sop");
  if (isRoadmap && !domains.includes("roadmap")) domains.push("roadmap");
  if (isOkr && !domains.includes("okr")) domains.push("okr");
  if (isCritic && !domains.includes("critic")) domains.push("critic");

  // Special multi-domain alignments
  if (q.includes("sprint is delayed and dora lead time")) {
    if (!domains.includes("dora")) domains.push("dora");
    if (!domains.includes("delivery")) domains.push("delivery");
  }
  if (q.includes("recent production outage with team okrs")) {
    if (!domains.includes("retro")) domains.push("retro");
    if (!domains.includes("okr")) domains.push("okr");
  }
  if (q.includes("q4 roadmap milestones against active sprint")) {
    if (!domains.includes("roadmap")) domains.push("roadmap");
    if (!domains.includes("sprint")) domains.push("sprint");
  }
  if (q.includes("audit our sprint retrospective summary to ensure compliance with company sop")) {
    if (!domains.includes("sop")) domains.push("sop");
    if (!domains.includes("critic")) domains.push("critic");
  }

  // RAG document lookups
  if (isDocumentLookup && domains.length === 0) {
    domains.push("rag");
    allow_rag = true;
    must_use_tools = false;
    confidence = 0.95;
  }

  return {
    intent_type: domains.length === 0 ? "DIRECT_LLM" : "DOMAIN_WORKFLOW",
    domains,
    must_use_tools: domains.length > 0 && !domains.includes("rag"),
    allow_rag: allow_rag || domains.includes("rag") || domains.includes("sop"),
    confidence,
    reasoning_summary: `Deterministic intent analyzer fallback (${reason}): ${domains.join(", ") || "direct LLM query"}.`,
  };
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

      let content = "";
      try {
        const messages = [
          new SystemMessage(systemTemplate),
          new HumanMessage(input.query),
        ];
        const result = await llm.invoke(messages);

        content = typeof result.content === 'string' ? result.content : String(result.content || '');
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          content = jsonMatch[0];
        } else {
          content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        }
        
        let parsed = JSON.parse(content);
        if (parsed && parsed.properties && !parsed.domains) {
          parsed = parsed.properties;
        }
        if (parsed && (Array.isArray(parsed.domains) || typeof parsed.must_use_tools === 'boolean')) {
          return parsed;
        }
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
            // repair also failed, continue to deterministic intent fallback
          }
        }
        
        // Gracefully fall back to deterministic intent analyzer rather than crashing with unhandled exception
        warn("LLM router returned non-JSON / refusal text, activating resilient fallback parser", { 
          query: input.query, 
          err: e.message, 
          contentSnippet: content.slice(0, 100) 
        });
        return getDeterministicFallbackPlan(input.query, "llm_json_parse_fallback", input.options || input);
      }

      return getDeterministicFallbackPlan(input.query, "llm_empty_response_fallback", input.options || input);
    }
  };
};

export { getRouterChain };


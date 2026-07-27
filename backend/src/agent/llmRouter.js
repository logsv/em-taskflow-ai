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
        enum: ["jira", "github", "notion", "calendar", "rag"],
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

const systemTemplate = `You are an expert routing assistant. Your task is to analyze user queries and determine the most relevant domain (primarily 'github' or 'rag') and a routing plan.

Currently, the primary active workspace domain is:
- 'github': for queries related to GitHub repositories, pull requests, issues, code, and overall engineering work/tasks.
- 'rag': for queries that require retrieval of information from local documents/PDFs.

CRITICAL ROUTING RULES:
1. For specific GitHub queries (e.g. "my open PRs", "repo issues"): set domains: ["github"], must_use_tools: true, confidence: 0.9.
2. For general productivity, daily focus, or open-ended work inquiries (e.g., "What should I focus on today?", "Daily overview", "What needs my attention?"): set domains: ["github"], must_use_tools: true, confidence: 0.55, and allow_rag: false.
3. For document/PDF queries: set domains: ["rag"], allow_rag: true, confidence: 0.8.

Output a flat JSON object with these exact keys: "domains", "must_use_tools", "allow_rag", "confidence", "reasoning_summary".
Example response format:
{
  "domains": ["github"],
  "must_use_tools": true,
  "allow_rag": false,
  "confidence": 0.55,
  "reasoning_summary": "General focus query targeting active github tasks."
}

Do not include wrappers like "properties" or "type". Only output raw JSON.
`;

// Initialize the LLM with the defined prompt and a JSON output parser
const getRouterChain = () => {
  const llm = getChatModel();

  const parser = new JsonOutputParser();

  return {
    async invoke(input) {
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

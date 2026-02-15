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

const systemTemplate = `You are an expert routing assistant. Your task is to analyze user queries and determine the most relevant domains (Jira, GitHub, Notion, Calendar, RAG) and a routing plan.

  Based on the user's query, identify which of the following domains are relevant:
  - 'jira': for queries related to Jira issues, sprints, projects, or work management.
  - 'github': for queries related to GitHub repositories, pull requests, issues, or code.
  - 'notion': for queries related to Notion pages, databases, tasks, or workspace data.
  - 'calendar': for queries related to Google Calendar events, schedules, or availability.
  - 'rag': for queries that require retrieval of information from a knowledge base or documents (e.g., asking about internal documentation, PDFs, or general knowledge that might be in a document store).

  You must decide if a tool call is mandatory ('must_use_tools') to fulfill the request. For example, if the user asks for "my Jira tickets," a tool call is mandatory. If the user asks for a definition, a tool call might not be mandatory.
  You must also decide if allowing the RAG agent ('allow_rag') is appropriate. Only allow RAG if the query explicitly or implicitly asks for document-based knowledge, context from PDFs, or general knowledge retrieval. Do not enable RAG for direct tool-based queries unless additional context from documents might enhance the answer.

  Provide your output as a JSON object strictly following this schema:
  ${JSON.stringify(routerOutputSchema, null, 2)}

  Only output the JSON object. Do not include any other text.
  `;


// Initialize the LLM with the defined prompt and a JSON output parser
const getRouterChain = () => {
  const llm = getChatModel(); // Assuming getChatModel provides an LLM instance

  const parser = new JsonOutputParser();

  return {
    async invoke(input) {
      const messages = [
        new SystemMessage(systemTemplate),
        new HumanMessage(input.query),
      ];
      const result = await llm.invoke(messages);
      return parser.invoke(result);
    }
  }
};

export { getRouterChain };

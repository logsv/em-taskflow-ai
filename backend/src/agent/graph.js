import { createSupervisor } from "@langchain/langgraph-supervisor";
import { getChatModel } from "../llm/index.js";
import {
  isMCPReady,
  initializeMCP,
  getJiraMCPTools,
  getGithubMCPTools,
  getNotionMCPTools,
  getGoogleMCPTools,
  getRAGMCPTools, // Assuming a similar function for RAG tools
} from "../mcp/index.js";
import { config } from "../config.js";
import { createJiraAgent } from "./jiraAgent.js";
import { createGithubAgent } from "./githubAgent.js";
import { createNotionAgent } from "./notionAgent.js";
import { createCalendarAgent } from "./calendarAgent.js";
import { createRagAgent } from "./ragAgent.js";
import { supervisorAgentPromptTemplate } from "./prompts.js";
import { getRouterChain } from './llmRouter.js'; // Import the new LLM router

let supervisorWithRag = null;
let supervisorWithoutRag = null;
let agentTools = [];
let domainToolsMap = {};
let initialized = false;

// Helper function to create the domain-to-tool mapping
async function getDomainToolsMapping() {
  const jiraTools = await getJiraMCPTools();
  const githubTools = await getGithubMCPTools();
  const notionTools = await getNotionMCPTools();
  const calendarTools = await getGoogleMCPTools();
  const ragTools = await getRAGMCPTools(); // Assuming a similar function for RAG tools

  const mapping = {};
  jiraTools.forEach(tool => mapping[tool.name] = "jira");
  githubTools.forEach(tool => mapping[tool.name] = "github");
  notionTools.forEach(tool => mapping[tool.name] = "notion");
  calendarTools.forEach(tool => mapping[tool.name] = "calendar");
  ragTools.forEach(tool => mapping[tool.name] = "rag");
  return mapping;
}

export async function initializeAgent() {
  if (initialized) return;

  console.log("🤖 Initializing LangGraph supervisor multi-agent system...");

  try {
    if (!isMCPReady()) {
      console.log("🔧 Initializing MCP services...");
      await initializeMCP();
    }

    // Populate the domainToolsMap during initialization
    domainToolsMap = await getDomainToolsMapping();

    const jiraTools = getJiraMCPTools();
    const githubTools = getGithubMCPTools();
    const notionTools = getNotionMCPTools();
    const calendarTools = getGoogleMCPTools();
    agentTools = [...jiraTools, ...githubTools, ...notionTools, ...calendarTools];
    const llm = getChatModel();

    if (typeof llm.bindTools === "function" && !llm.__langgraphPatched) {
      const originalBindTools = llm.bindTools.bind(llm);
      llm.bindTools = (tools, options) => {
        const bound = originalBindTools(tools, options);
        if (bound && typeof bound === "object" && !("bindTools" in bound)) {
          Object.defineProperty(bound, "bindTools", {
            value: originalBindTools,
            writable: false,
            enumerable: false,
          });
        }
        return bound;
      };
      Object.defineProperty(llm, "__langgraphPatched", {
        value: true,
        writable: false,
        enumerable: false,
      });
    }

    const jiraAgent = await createJiraAgent();
    const githubAgent = await createGithubAgent();
    const notionAgent = await createNotionAgent();
    const calendarAgent = await createCalendarAgent();
    const ragAgent = await createRagAgent();

    const promptValue = await supervisorAgentPromptTemplate.invoke({});
    const systemMessage = promptValue.toChatMessages()[0];

    const baseAgents = [jiraAgent, githubAgent, notionAgent, calendarAgent];

    const withRagWorkflow = createSupervisor({
      agents: [...baseAgents, ragAgent],
      llm: llm.bind({ response_format: { type: "json_object" } }),
      prompt: systemMessage,
      outputMode: "json",
    });

    const withoutRagWorkflow = createSupervisor({
      agents: baseAgents,
      llm: llm.bind({ response_format: { type: "json_object" } }),
      prompt: systemMessage,
      outputMode: "json",
    });

    supervisorWithRag = withRagWorkflow.compile();
    supervisorWithoutRag = withoutRagWorkflow.compile();

    initialized = true;
    console.log("✅ Supervisor multi-agent system initialized");
  } catch (error) {
    console.error("❌ Failed to initialize supervisor agent system:", error);
    throw error;
  }
}

export async function executeAgentQuery(query, options = {}) {
  await ensureAgentReady();

  // Use the LLM router to determine the routing plan
  const routerChain = getRouterChain();
  const routingPlan = await routerChain.invoke({ query });

  // Confidence-driven clarification
  if (routingPlan.confidence < 0.7) {
    const confirmation = await ask_user({
        question: `I have low confidence in the plan to answer your query. I think the query is about ${routingPlan.reasoning_summary}. Do you want me to proceed?`,
        type: 'yesno',
        header: 'Low confidence'
    });
    if (confirmation.answer !== 'yes') {
      return {
        executiveSummary: "Query execution cancelled by user.",
        keyRisksAndBlockers: [],
        whatNeedsDecision: [],
        actionItems: [],
        evidenceBySource: {},
      };
    }
  }

  const { maxIterations = 10, stream = false, threadId } = options; // includeRagAgent is removed
  const app = routingPlan.allow_rag ? supervisorWithRag : supervisorWithoutRag;
  if (!app) {
    throw new Error("Supervisor graph not initialized");
  }

  try {
    const input = {
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
      // Pass routing plan details to the supervisor for policy enforcement and prompt adjustments
      routing_plan: routingPlan,
    };

    const runId = threadId || `thread_${Date.now()}`;
    if (stream) {
      // Streaming is not supported with JSON output format yet.
      // We would need to implement a custom parser for streaming JSON.
      // For now, we will return an error.
      throw new Error("Streaming is not supported with the current agent configuration.");
    }

    const result = await app.invoke(input, {
      configurable: {
        thread_id: runId,
      },
      recursionLimit: maxIterations,
    });

    const messages = Array.isArray(result.messages) ? result.messages : [];
    const lastMessage = messages[messages.length - 1];
    const responseText = extractMessageText(lastMessage) || "No response generated.";
    const toolsUsed = collectToolsUsed(messages);

    // --- Policy Validation ---
    const invokedDomains = new Set();
    const RAG_TOOL_NAME = "rag_db_query_retriever"; // Defined in ragAgent.js

    for (const toolName of toolsUsed) {
      if (toolName === RAG_TOOL_NAME) {
        invokedDomains.add("rag");
      } else {
        const domain = domainToolsMap[toolName];
        if (domain) {
          invokedDomains.add(domain);
        }
      }
    }

    // Check if at least one tool was used when required
    if (routingPlan.must_use_tools && toolsUsed.length === 0) {
      throw new Error("Policy Violation: The routing plan required tool usage, but no tools were used.");
    }

    // Check if expected domains were invoked
    for (const expectedDomain of routingPlan.domains) {
      if (!invokedDomains.has(expectedDomain)) {
        throw new Error(`Policy Violation: Expected domain '${expectedDomain}' was not invoked by supervisor.`);
      }
    }

    // Check for unexpected domain invocations
    for (const invokedDomain of invokedDomains) {
      if (invokedDomain === "rag") {
        if (!routingPlan.allow_rag) {
          throw new Error(`Policy Violation: RAG agent (tool: ${RAG_TOOL_NAME}) was invoked but 'allow_rag' was false in routing plan.`);
        }
      } else if (!routingPlan.domains.includes(invokedDomain)) {
        throw new Error(`Policy Violation: Domain '${invokedDomain}' was invoked but not specified in routing plan.`);
      }
    }
    // --- End Policy Validation ---

    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse supervisor output as JSON:", e);
      // If parsing fails, we can try to recover or return an error.
      // For now, we will return a structured error.
      return {
        executiveSummary: "Failed to parse the output from the agent.",
        keyRisksAndBlockers: [`The agent produced an invalid JSON output: ${responseText}`],
        whatNeedsDecision: [],
        actionItems: [],
        evidenceBySource: {},
      };
    }
  } catch (error) {
    console.error("❌ Agent query execution failed:", error);
    return {
      executiveSummary: "An error occurred during agent execution.",
      keyRisksAndBlockers: [error.message],
      whatNeedsDecision: [],
      actionItems: [],
      evidenceBySource: {},
    };
  }
}

function extractMessageText(message) {
  if (!message || !message.content) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .filter(Boolean)
      .join("\n");
  }
  return String(message.content);
}

function collectToolsUsed(messages) {
  const set = new Set();
  for (const message of messages) {
    if (!message) continue;
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const call of calls) {
      if (call?.name) {
        set.add(call.name);
      }
    }
  }
  return Array.from(set);
}

export async function checkAgentReadiness() {
  try {
    if (!initialized) {
      await initializeAgent();
    }

    return {
      ready: initialized && !!supervisorWithRag && !!supervisorWithoutRag,
      model: config.llm.defaultModel,
      toolCount: agentTools.length,
    };
  } catch (error) {
    return {
      ready: false,
      model: config.llm.defaultModel,
      toolCount: 0,
      error: error.message,
    };
  }
}

export async function getAgentTools() {
  await ensureAgentReady();

  const toolInfo = agentTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.schema || {},
  }));

  return {
    tools: agentTools,
    toolInfo,
  };
}

export function getAgentInstance() {
  return supervisorWithRag;
}

export async function resetAgent() {
  initialized = false;
  supervisorWithRag = null;
  supervisorWithoutRag = null;
  agentTools = [];
  await initializeAgent();
}

async function ensureAgentReady() {
  if (!initialized || !supervisorWithRag || !supervisorWithoutRag) {
    await initializeAgent();
  }
}

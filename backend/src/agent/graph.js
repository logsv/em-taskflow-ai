import { createSupervisor } from "@langchain/langgraph-supervisor";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "../llm/index.js";
import {
  isMCPReady,
  initializeMCP,
  getJiraMCPTools,
  getGithubMCPTools,
  getNotionMCPTools,
  getGoogleMCPTools,
} from "../mcp/index.js";
import { config } from "../config.js";
import { createJiraAgent } from "./jiraAgent.js";
import { createGithubAgent } from "./githubAgent.js";
import { createNotionAgent } from "./notionAgent.js";
import { createCalendarAgent } from "./calendarAgent.js";
import { createRagAgent } from "./ragAgent.js";
import { supervisorAgentPromptTemplate } from "./prompts.js";

// Define the custom state schema for the supervisor graph
export const SupervisorState = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  routingPlan: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  evidence: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
});

let compiledGraph = null;
let agentTools = [];
let initialized = false;

// Pre-model hook: dynamically inject active routing constraints as a system instruction
export function supervisorPreModelHook(state) {
  const allowed = state.routingPlan?.domains || [];
  const systemPrompt = `Active Routing Plan Policy:
Authorized worker domains for this query: ${allowed.length > 0 ? allowed.join(", ") : "none"}.
RAG allowed: ${state.routingPlan?.allow_rag ? "YES" : "NO"}.
You MUST ONLY delegate to the authorized domains. Do not attempt to use transfer tools for unauthorized domains.`;

  const systemMessage = new SystemMessage({ content: systemPrompt });
  return {
    llmInputMessages: [systemMessage, ...state.messages],
  };
}

// Post-model hook: structural policy guardrail to block unauthorized handoffs in real-time
export function supervisorPostModelHook(state) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const allowed = state.routingPlan?.domains || [];
    // Ensure "rag" is treated as allowed if allow_rag is true
    const fullAllowedDomains = [...allowed];
    if (state.routingPlan?.allow_rag && !fullAllowedDomains.includes("rag")) {
      fullAllowedDomains.push("rag");
    }

    const unauthorizedCall = lastMessage.tool_calls.find((toolCall) => {
      if (toolCall.name.startsWith("transfer_to_")) {
        const agentName = toolCall.name.replace("transfer_to_", "");
        const domain = agentName.replace("_agent", "");
        return !fullAllowedDomains.includes(domain);
      }
      return false;
    });

    if (unauthorizedCall) {
      const targetDomain = unauthorizedCall.name.replace("transfer_to_", "").replace("_agent", "");
      console.warn(`🛡️ Policy Guardrail Intercepted: Handoff to unauthorized domain '${targetDomain}' blocked.`);

      // Replace the tool call message with a text explanation to force self-correction
      const correctedAIMessage = new AIMessage({
        id: lastMessage.id, // replaces the last message by reusing its ID
        content: `Error: Handoff to the '${targetDomain}' domain is unauthorized under the active routing plan. Permitted domains are: ${fullAllowedDomains.join(", ")}. Please answer directly or select a permitted agent.`,
      });

      return {
        messages: [correctedAIMessage],
      };
    }
  }

  return {};
}

export async function initializeAgent(options = {}) {
  if (initialized) return;

  console.log("🤖 Initializing LangGraph supervisor multi-agent system...");

  try {
    if (!options.skipMcpInit && !isMCPReady()) {
      console.log("🔧 Initializing MCP services...");
      await initializeMCP();
    }

    const jiraTools = getJiraMCPTools();
    const githubTools = getGithubMCPTools();
    const notionTools = getNotionMCPTools();
    const calendarTools = getGoogleMCPTools();
    agentTools = [...jiraTools, ...githubTools, ...notionTools, ...calendarTools];

    const llm = options.llm || getChatModel();

    const jira = options.jiraAgent || await createJiraAgent();
    const github = options.githubAgent || await createGithubAgent();
    const notion = options.notionAgent || await createNotionAgent();
    const calendar = options.calendarAgent || await createCalendarAgent();
    const rag = options.ragAgent || await createRagAgent();

    const promptValue = await supervisorAgentPromptTemplate.invoke({});
    const systemMessage = promptValue.toChatMessages()[0];

    const baseAgents = [jira, github, notion, calendar];
    const createSupervisorFn = options.createSupervisor || createSupervisor;

    const workflow = createSupervisorFn({
      agents: [...baseAgents, rag],
      llm,
      prompt: systemMessage,
      stateSchema: SupervisorState,
      outputMode: "last_message",
      preModelHook: supervisorPreModelHook,
      postModelHook: supervisorPostModelHook,
    });

    compiledGraph = workflow.compile ? workflow.compile() : workflow;
    initialized = true;
    console.log("✅ Supervisor multi-agent system initialized");
  } catch (error) {
    console.error("❌ Failed to initialize supervisor agent system:", error);
    throw error;
  }
}


export async function executeAgentQuery(query, options = {}) {
  await ensureAgentReady();

  const { maxIterations = 10, stream = false, routingPlan, threadId } = options;
  const app = compiledGraph;
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
      routingPlan: routingPlan || null,
      evidence: {},
    };

    const runId = threadId || `thread_${Date.now()}`;
    if (stream) {
      return app.stream(input, {
        configurable: {
          thread_id: runId,
        },
        recursionLimit: maxIterations,
      });
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

    return {
      response: responseText,
      toolsUsed,
      messageCount: messages.length,
      evidence: result.evidence || {},
    };
  } catch (error) {
    console.error("❌ Agent query execution failed:", error);
    throw error;
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
      ready: initialized && !!compiledGraph,
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
  return compiledGraph;
}

export async function resetAgent() {
  initialized = false;
  compiledGraph = null;
  agentTools = [];
}

async function ensureAgentReady() {
  if (!initialized || !compiledGraph) {
    await initializeAgent();
  }
}


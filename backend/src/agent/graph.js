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
import { getRagTool } from "./ragAgent.js";
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
  const hasWorkerRun =
    (state.messages || []).length >= 3 ||
    (state.messages || []).some(
      (m) =>
        m.role === "tool" ||
        m.type === "tool" ||
        m._getType?.() === "tool" ||
        (typeof m.name === "string" &&
          (m.name.includes("transfer_") || m.name.includes("_agent") || (m.name !== "supervisor" && m.name !== "user"))) ||
        (typeof m.content === "string" &&
          (m.content.includes("Executive Summary") ||
            m.content.includes("GitHub tool search") ||
            m.content.includes("findings") ||
            m.content.includes("evidence")))
    );

  const routingPrompt = `Active Routing Plan Policy:
Authorized worker domains for this query: ${allowed.length > 0 ? allowed.join(", ") : "none"}.
RAG allowed: ${state.routingPlan?.allow_rag ? "YES" : "NO"}.
${
  hasWorkerRun
    ? "STOP DELEGATING: A worker specialist has ALREADY returned evidence. You MUST synthesize the collected findings and output the final answer directly without invoking transfer_to_ tools."
    : "Delegate to authorized worker domains by calling the appropriate transfer tool."
}`;

  // Separate system messages from non-system messages to satisfy Gemini's
  // constraint that all system messages must precede user/assistant messages.
  const existingSystemMessages = [];
  const nonSystemMessages = [];
  for (const msg of state.messages) {
    if (msg._getType?.() === "system" || msg.constructor?.name === "SystemMessage") {
      existingSystemMessages.push(msg);
    } else {
      nonSystemMessages.push(msg);
    }
  }

  const routingSystemMessage = new SystemMessage({ content: routingPrompt });

  return {
    llmInputMessages: [...existingSystemMessages, routingSystemMessage, ...nonSystemMessages],
  };
}

// Post-model hook: structural policy guardrail to block unauthorized handoffs and prevent infinite handoff loops
export function supervisorPostModelHook(state) {
  const messages = state.messages || [];
  const lastMessage = messages[messages.length - 1];

  if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    const allowed = state.routingPlan?.domains || [];
    const fullAllowedDomains = [...allowed];
    if (state.routingPlan?.allow_rag && !fullAllowedDomains.includes("rag")) {
      fullAllowedDomains.push("rag");
    }

    // Check if worker agent has already executed in this conversation trajectory
    const workerExecuted =
      messages.length >= 3 ||
      messages.some(
        (m) =>
          m.role === "tool" ||
          m.type === "tool" ||
          m._getType?.() === "tool" ||
          (typeof m.name === "string" && m.name.includes("transfer_")) ||
          (typeof m.content === "string" &&
            (m.content.includes("Executive Summary") ||
              m.content.includes("GitHub tool search") ||
              m.content.includes("evidence")))
      );

    const handoffCall = lastMessage.tool_calls.find((toolCall) => toolCall.name.startsWith("transfer_to_"));

    if (workerExecuted && handoffCall) {
      console.warn(`🛡️ Policy Guardrail Intercepted: Prevented repeated handoff to '${handoffCall.name}' after worker execution.`);
      const workerMsg = [...messages].reverse().find(
        (m) =>
          typeof m.content === "string" &&
          m.content.trim().length > 30 &&
          !m.name?.startsWith?.("transfer_") &&
          m.name !== "supervisor"
      );
      const synthesisContent = workerMsg ? workerMsg.content : "Workspace findings gathered from GitHub agent.";

      // Mutate tool_calls array elements directly and construct clean AIMessage with matching ID
      if (Array.isArray(lastMessage.tool_calls)) {
        lastMessage.tool_calls.splice(0, lastMessage.tool_calls.length);
      }
      lastMessage.content = synthesisContent;

      const cleanAIMessage = new AIMessage({
        id: lastMessage.id,
        content: synthesisContent,
        tool_calls: [],
      });

      return {
        messages: [cleanAIMessage],
      };
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

      const correctedAIMessage = new AIMessage({
        id: lastMessage.id,
        content: `Error: Handoff to the '${targetDomain}' domain is unauthorized under the active routing plan. Permitted domains are: ${fullAllowedDomains.join(", ")}. Please answer directly or select a permitted agent.`,
      });

      return {
        messages: [correctedAIMessage],
      };
    }
  }

  return {};
}

export function createSupervisorLlmWrapper(baseLlm) {
  if (!baseLlm || baseLlm._supervisorWrapped) return baseLlm;

  const originalBindTools = baseLlm.bindTools?.bind(baseLlm);
  if (!originalBindTools) return baseLlm;

  baseLlm.bindTools = function (tools, options) {
    const boundLlm = originalBindTools(tools, options);
    const originalInvoke = boundLlm.invoke.bind(boundLlm);

    boundLlm.invoke = async function (input, options) {
      const inputArr = Array.isArray(input) ? input : (input?.messages || []);
      const hasWorkerRun =
        inputArr.length >= 3 ||
        inputArr.some(
          (m) =>
            m.role === "tool" ||
            m.type === "tool" ||
            m._getType?.() === "tool" ||
            (typeof m.name === "string" && (m.name.includes("transfer_") || m.name.includes("_agent"))) ||
            (typeof m.content === "string" &&
              (m.content.includes("Executive Summary") ||
                m.content.includes("GitHub tool search") ||
                m.content.includes("findings") ||
                m.content.includes("evidence")))
        );

      const res = await originalInvoke(input, options);

      if (hasWorkerRun && res && Array.isArray(res.tool_calls) && res.tool_calls.length > 0) {
        console.warn(`🛡️ Supervisor LLM Intercept: Prevented repeated handoff to '${res.tool_calls[0].name}' after worker execution.`);
        const workerMsg = [...inputArr].reverse().find(
          (m) =>
            typeof m.content === "string" &&
            m.content.trim().length > 30 &&
            !m.name?.startsWith?.("transfer_") &&
            m.name !== "supervisor"
        );
        const content = workerMsg ? workerMsg.content : "Workspace findings gathered from worker agent.";
        return new AIMessage({
          id: res.id,
          content,
          tool_calls: [],
        });
      }

      return res;
    };

    return boundLlm;
  };

  baseLlm._supervisorWrapped = true;
  return baseLlm;
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
    agentTools = [...jiraTools, ...githubTools, ...notionTools, ...calendarTools, getRagTool()];

    const rawLlm = options.llm || getChatModel();
    const llm = createSupervisorLlmWrapper(rawLlm);

    const jira = options.jiraAgent || await createJiraAgent();
    const github = options.githubAgent || await createGithubAgent();
    const notion = options.notionAgent || await createNotionAgent();
    const calendar = options.calendarAgent || await createCalendarAgent();

    const promptValue = await supervisorAgentPromptTemplate.invoke({});
    const systemMessage = promptValue.toChatMessages()[0];

    const baseAgents = [jira, github, notion, calendar];
    const createSupervisorFn = options.createSupervisor || createSupervisor;

    const workflow = createSupervisorFn({
      agents: baseAgents,
      llm,
      prompt: systemMessage,
      stateSchema: SupervisorState,
      outputMode: "full_history",
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


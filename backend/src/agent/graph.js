import { createSupervisor } from "@langchain/langgraph-supervisor";
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

let supervisorWithRag = null;
let supervisorWithoutRag = null;
let agentTools = [];
let initialized = false;

export async function initializeAgent() {
  if (initialized) return;

  console.log("🤖 Initializing LangGraph supervisor multi-agent system...");

  try {
    if (!isMCPReady()) {
      console.log("🔧 Initializing MCP services...");
      await initializeMCP();
    }

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
      llm,
      prompt: systemMessage,
      outputMode: "last_message",
    });

    const withoutRagWorkflow = createSupervisor({
      agents: baseAgents,
      llm,
      prompt: systemMessage,
      outputMode: "last_message",
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

  const { maxIterations = 10, stream = false, includeRagAgent = true, threadId } = options;
  const app = includeRagAgent ? supervisorWithRag : supervisorWithoutRag;
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
      usedRagAgent: includeRagAgent,
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

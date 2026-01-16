import { DynamicTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { getChatModel } from "../llm/index.js";
import {
  isMCPReady,
  initializeMCP,
  getJiraMCPTools,
  getGithubMCPTools,
  getNotionMCPTools,
} from "../mcp/index.js";
import { config } from "../config.js";
import { createJiraAgent } from "./jiraAgent.js";
import { createGithubAgent } from "./githubAgent.js";
import { createNotionAgent } from "./notionAgent.js";
import { createRagAgent } from "./ragAgent.js";

let supervisorApp = null;
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
    agentTools = [...jiraTools, ...githubTools, ...notionTools];
    const llm = getChatModel();

    if (typeof llm.bindTools === "function" && !llm.__langgraphPatched) {
      const originalBindTools = llm.bindTools.bind(llm);
      llm.bindTools = (tools, config) => {
        const bound = originalBindTools(tools, config);
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
    const ragAgent = await createRagAgent();

    const workflow = createSupervisor({
      agents: [jiraAgent, githubAgent, notionAgent, ragAgent],
      llm,
      prompt:
        "You are a supervisor agent that routes work between Jira, GitHub, Notion, and a dedicated RAG retrieval agent. Decide which specialist should handle each part of the task, delegate work accordingly, and ensure a coherent final answer for the user.",
      outputMode: "last_message",
    });

    supervisorApp = workflow.compile();

    initialized = true;
    console.log("✅ Supervisor multi-agent system initialized");
  } catch (error) {
    console.error("❌ Failed to initialize supervisor agent system:", error);
    throw error;
  }
}

export async function executeAgentQuery(query, options = {}) {
  await ensureAgentReady();

  const { maxIterations = 10, stream = false } = options;

  try {
    console.log("🔍 Executing supervisor agent query:", query.slice(0, 100) + "...");

    const input = {
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
    };

    if (stream) {
      return supervisorApp.stream(input, {
        configurable: {
          thread_id: `thread_${Date.now()}`,
        },
        recursionLimit: maxIterations,
      });
    }

    const result = await supervisorApp.invoke(input, {
      configurable: {
        thread_id: `thread_${Date.now()}`,
      },
      recursionLimit: maxIterations,
    });

    const messages = result.messages || [];
    const lastMessage = messages[messages.length - 1];

    let responseText = "";
    if (lastMessage && lastMessage.content) {
      responseText =
        typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content);
    }

    if (!responseText) {
      responseText = "No response generated.";
    }

    return {
      response: responseText,
      toolsUsed: [],
    };
  } catch (error) {
    console.error("❌ Agent query execution failed:", error);
    throw error;
  }
}

export async function checkAgentReadiness() {
  try {
    if (!initialized) {
      await initializeAgent();
    }

    return {
      ready: initialized && !!supervisorApp,
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

  const toolInfo = agentTools.map(tool => ({
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
  return supervisorApp;
}

export async function resetAgent() {
  console.log("🔄 Resetting supervisor agent...");
  
  initialized = false;
  supervisorApp = null;
  agentTools = [];
  
  await initializeAgent();
}

async function ensureAgentReady() {
  if (!initialized || !supervisorApp) {
    await initializeAgent();
  }
}

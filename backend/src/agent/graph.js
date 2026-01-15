import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { DynamicTool } from "@langchain/core/tools";
import { getChatOllama } from "../llm/index.js";
import { getMCPTools, getMCPToolGroups, isMCPReady, initializeMCP } from "../mcp/index.js";
import ragService from "../services/ragService.js";

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

    agentTools = getMCPTools();
    const { jiraTools, githubTools, notionTools } = getMCPToolGroups();

    console.log(
      `📋 MCP tools loaded. Total: ${agentTools.length}, Jira: ${jiraTools.length}, GitHub: ${githubTools.length}, Notion: ${notionTools.length}`,
    );

    const llm = getChatOllama();

    const jiraAgent = createReactAgent({
      llm,
      tools: jiraTools.length > 0 ? jiraTools : agentTools,
      name: "jira_agent",
      prompt:
        "You are a Jira expert. Manage issues, sprints, roadmaps, and work items. Use only tools relevant to Jira and related Atlassian resources.",
    });

    const githubAgent = createReactAgent({
      llm,
      tools: githubTools.length > 0 ? githubTools : agentTools,
      name: "github_agent",
      prompt:
        "You are a GitHub expert. Manage repositories, pull requests, issues, and reviews. Use tools related to GitHub or source control.",
    });

    const notionAgent = createReactAgent({
      llm,
      tools: notionTools.length > 0 ? notionTools : agentTools,
      name: "notion_agent",
      prompt:
        "You are a Notion workspace expert. Manage pages, databases, tasks, and project documentation using Notion tools.",
    });

    const ragTool = new DynamicTool({
      name: "rag_db_query_retriever",
      description:
        "Use this tool to search the document knowledge base. It converts the user question into a focused database query using an LLM, retrieves the most relevant document chunks, and returns them as JSON.",
      func: async (input) => {
        const query = typeof input === "string" ? input : JSON.stringify(input);
        const result = await ragService.searchRelevantChunks(query, 5);
        return JSON.stringify(result);
      },
    });

    const ragAgent = createReactAgent({
      llm,
      tools: [ragTool],
      name: "rag_agent",
      prompt:
        "You are a retrieval specialist for the local document knowledge base. When asked about documents, policies, or reference material, use your RAG tool to convert the question into a focused database query, retrieve the most relevant chunks, and summarize them clearly with citations.",
    });

    const workflow = createSupervisor({
      agents: [jiraAgent, githubAgent, notionAgent, ragAgent],
      llm,
      prompt:
        "You are a supervisor agent that routes work between Jira, GitHub, Notion, and a RAG document specialist. Decide which agent should handle each part of the task and ensure a coherent final answer for the user.",
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
      ready: initialized && !!supervisorApp && agentTools.length > 0,
      model: "gpt-oss:latest",
      toolCount: agentTools.length,
    };
  } catch (error) {
    return {
      ready: false,
      model: "gpt-oss:latest",
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

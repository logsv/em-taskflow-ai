import { START, StateGraph, Command, getCurrentTaskInput } from "@langchain/langgraph";
import { createReactAgent, createReactAgentAnnotation } from "@langchain/langgraph/prebuilt";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicTool, tool } from "@langchain/core/tools";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getChatOllama } from "../llm/index.js";
import { getMCPTools, getMCPToolGroups, isMCPReady, initializeMCP } from "../mcp/index.js";
import ragService from "../services/ragService.js";
import { config } from "../config.js";

let supervisorApp = null;
let agentTools = [];
let initialized = false;

const WHITESPACE_RE = /\s+/;

function normalizeAgentName(agentName) {
  return agentName.trim().replace(WHITESPACE_RE, "_").toLowerCase();
}

function createHandoffTool({ agentName }) {
  const toolName = `transfer_to_${normalizeAgentName(agentName)}`;

  const handoffTool = tool(
    async (_, config) => {
      const toolMessage = new ToolMessage({
        content: `Successfully transferred to ${agentName}`,
        name: toolName,
        tool_call_id: config.toolCall.id,
      });

      const state = getCurrentTaskInput();

      return new Command({
        goto: agentName,
        graph: Command.PARENT,
        update: { messages: state.messages.concat(toolMessage) },
      });
    },
    {
      name: toolName,
      schema: z.object({}),
      description: "Ask another agent for help.",
    },
  );

  return handoffTool;
}

function createHandoffBackMessages(agentName, supervisorName) {
  const toolCallId = uuidv4();
  const toolName = `transfer_back_to_${normalizeAgentName(supervisorName)}`;
  const toolCalls = [{ name: toolName, args: {}, id: toolCallId }];

  return [
    new AIMessage({
      content: `Transferring back to ${supervisorName}`,
      tool_calls: toolCalls,
      name: agentName,
    }),
    new ToolMessage({
      content: `Successfully transferred back to ${supervisorName}`,
      name: toolName,
      tool_call_id: toolCallId,
    }),
  ];
}

function makeCallAgent(agent, outputMode, addHandoffBackMessages, supervisorName) {
  if (!["full_history", "last_message"].includes(outputMode)) {
    throw new Error(
      `Invalid agent output mode: ${outputMode}. Needs to be one of ["full_history", "last_message"]`,
    );
  }

  return async (state) => {
    const output = await agent.invoke(state);
    let { messages } = output;

    if (outputMode === "last_message") {
      messages = messages.slice(-1);
    }

    if (addHandoffBackMessages) {
      messages.push(...createHandoffBackMessages(agent.name, supervisorName));
    }

    return { ...output, messages };
  };
}

function createSupervisorWorkflow({
  agents,
  llm,
  tools,
  prompt,
  stateSchema,
  outputMode = "last_message",
  addHandoffBackMessages = true,
  supervisorName = "supervisor",
}) {
  const agentNames = new Set();

  for (const agent of agents) {
    if (!agent.name || agent.name === "LangGraph") {
      throw new Error(
        "Please specify a name when you create your agent, either via `createReactAgent({ ..., name: agentName })` or via `graph.compile({ name: agentName })`.",
      );
    }

    if (agentNames.has(agent.name)) {
      throw new Error(`Agent with name '${agent.name}' already exists. Agent names must be unique.`);
    }

    agentNames.add(agent.name);
  }

  const handoffTools = agents.map((agent) => createHandoffTool({ agentName: agent.name }));
  const allTools = [...(tools ?? []), ...handoffTools];

  const schema = stateSchema ?? createReactAgentAnnotation();

  const supervisorAgent = createReactAgent({
    name: supervisorName,
    llm,
    tools: allTools,
    prompt,
    stateSchema: schema,
  });

  let builder = new StateGraph(schema)
    .addNode(supervisorAgent.name, supervisorAgent, {
      ends: [...agentNames],
    })
    .addEdge(START, supervisorAgent.name);

  for (const agent of agents) {
    builder = builder.addNode(
      agent.name,
      makeCallAgent(agent, outputMode, addHandoffBackMessages, supervisorName),
      {
        subgraphs: [agent],
      },
    );
    builder = builder.addEdge(agent.name, supervisorAgent.name);
  }

  return builder;
}

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

    if (typeof llm.bindTools !== "function") {
      llm.bindTools = function (tools) {
        return this.bind({ tools });
      };
    }

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

    const workflow = createSupervisorWorkflow({
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
